import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, Notification, protocol, safeStorage, screen, shell, Tray } from 'electron'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile, mkdir, realpath, stat, rename } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseClient } from './database'
import { startLocalService } from './local-service'
import { refreshPublicCharacter } from './provider-refresh'
import { rendererOrigin } from './renderer-origin'
import { runDesktopAcceptance } from './desktop-acceptance'
import { EncryptedFileStore } from './secrets'
import type { WindowState } from '../shared/bridge'
import { updateNotice } from './updates/notices'
import { createUpdateService, type UpdatePreferences } from './updates/service'
import { electronUpdaterAdapter } from './updates/electron'
import { isUpdateChannel } from '../shared/updates'
import { minimumWindowSize, readWindowPlacement, rememberWindowPlacement } from './window-placement'
import { appIconFiles, resolveAppIcon, type AppIconVariant } from '../shared/app-icons'
import { openSplash } from './splash'
import { alignShortcutActivator, appIdentity, persistWindowsIcon, refreshPinnedShellItems, registerToastIdentity, taskbarDetails, updatePinnedAppIcons } from './windows-app-icon'

// Development runs are their own app: own name and data folder, so they never share the installed app's database
// or single-instance lock. This runs before anything reads the user-data path
const identity=appIdentity(app.isPackaged)
if(!app.isPackaged){app.setName(identity.displayName);app.setPath('userData',join(app.getPath('appData'),identity.dataFolder))}
// Test profiles isolate Chromium caches as well as SQLite, including alongside dev mode
if(process.env.WOW_COMPANION_DATA_DIR){const testProfile=resolve(process.env.WOW_COMPANION_DATA_DIR);mkdirSync(testProfile,{recursive:true});app.setPath('userData',testProfile);app.setPath('sessionData',testProfile)}

// Windows names toasts after this identity and routes their clicks to the activator class; startup sync can raise one
// before the window exists, so both are set before anything else. A fixed activator keeps Action Center clicks working
// after a restart, where Electron would otherwise pick a new random class every run
if(process.platform==='win32'){app.setToastActivatorCLSID(identity.activator);app.setAppUserModelId(identity.appId)}

protocol.registerSchemesAsPrivileged([
  {scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},
  {scheme:'wow-asset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},
])
const root=dirname(fileURLToPath(import.meta.url))
let window:BrowserWindow|null=null
let cleanup:(()=>Promise<void>)|undefined
let closing=false
let installingUpdate=false
let saveWindowPlacement:(()=>void)|undefined
let tray:Tray|null=null
let quitting=false
let splash:Awaited<ReturnType<typeof openSplash>>=null
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: wow-asset:; connect-src 'self' blob: data: ws://127.0.0.1:* wow-asset:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"
async function main(){
  const userDir=process.env.WOW_COMPANION_DATA_DIR?resolve(process.env.WOW_COMPANION_DATA_DIR):app.getPath('userData')
  await mkdir(userDir,{recursive:true})
  const db=new DatabaseClient(resolve(userDir,'companion.sqlite'))
  const settings=await db.call('getSettings')
  nativeTheme.themeSource=settings.theme
  // The boot screen stays out of test runs and hidden launches, where nobody is watching
  if(!process.env.WOW_COMPANION_HEADLESS&&!process.argv.includes('--acceptance')&&!process.argv.includes('--smoke')){
    const variant=resolveAppIcon(settings.appIcon,app.getVersion())
    const assets=resolve(app.isPackaged?resolve(root,'../renderer'):app.getAppPath(),app.isPackaged?'assets':'public/assets')
    splash=await openSplash({logoPath:resolve(assets,appIconFiles[variant].logo),icon:resolve(assets,appIconFiles[variant].png),variant,version:app.getVersion(),reducedMotion:settings.reducedMotion}).catch(()=>null)
    splash?.step('Opening your data',.2)
  }
  const windowFrame='custom' as const
  const devUrl=process.env.ELECTRON_RENDERER_URL
  const origins=['app://companion',...(devUrl?[new URL(devUrl).origin]:[])]
  const secrets=new EncryptedFileStore(resolve(userDir,'secrets.json'),{available:()=>safeStorage.isEncryptionAvailable(),encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)})
  const addonDir=app.isPackaged?resolve(process.resourcesPath,'addon'):resolve(app.getAppPath(),'addon')
  let keepInTray=settings.keepInTray
  const isolated=!!process.env.WOW_COMPANION_DATA_DIR||process.env.WOW_COMPANION_HEADLESS==='1'
  const showWindow=()=>{if(!window)return;if(window.isMinimized())window.restore();window.show();window.focus()}
  // Shown notices are held until dismissed, since a collected one loses its click handler
  const notices=new Set<Notification>()
  const notify=(alert:{title:string;body:string})=>{
    const notice=new Notification({title:alert.title,body:alert.body,icon:windowIcon,silent:false})
    notices.add(notice)
    notice.on('click',()=>{notices.delete(notice);showWindow()})
    notice.on('close',()=>notices.delete(notice))
    notice.show()
  }
  // Alerts stay quiet in isolated test profiles and when the player turned them off
  const onAlert=async(alert:{title:string;body:string})=>{
    if(isolated||!Notification.isSupported())return
    const current=await db.call('getSettings').catch(()=>null)
    if(!current?.desktopAlerts)return
    notify(alert)
  }
  // Clicks from Action Center, after a restart, or on a launch the click started arrive here rather than on the notice
  if(process.platform==='win32')Notification.handleActivation(()=>showWindow())
  splash?.step('Starting local services',.4)
  const service=await startLocalService({db,origins,refreshCharacter:id=>refreshPublicCharacter(db,id),gameDataDir:resolve(userDir,'gamedata'),secrets,addonDir,assetsDir:userDir,autoSync:!process.env.WOW_COMPANION_DATA_DIR,onAlert:alert=>void onAlert(alert),onSettings:next=>{keepInTray=next.keepInTray}})
  let nativeOperations=0
  let updateBlockerAcknowledgedAt=0
  const updatePreferences=resolve(userDir,'updates.json')
  let lastUpdateState:import('../shared/updates').UpdateState|null=null
  const updateNoticesSent=new Set<string>()
  splash?.step('Checking for updates',.6)
  const updates=await createUpdateService({
    version:app.getVersion(),
    disabledReason:!app.isPackaged?'Updates are available in installed release builds':process.env.WOW_COMPANION_DATA_DIR||process.argv.includes('--acceptance')||process.argv.includes('--smoke')?'Automatic updates are disabled in isolated test runs':process.platform!=='win32'&&process.platform!=='darwin'?'In-app updates currently support Windows and macOS':null,
    adapter:electronUpdaterAdapter(),
    readPreferences:async()=>{try{return JSON.parse(await readFile(updatePreferences,'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}},
    writePreferences:async(value:UpdatePreferences)=>{const temporary=updatePreferences+'.tmp';await writeFile(temporary,JSON.stringify(value),{encoding:'utf8',mode:0o600});await rename(temporary,updatePreferences)},
    blockers:()=>[...(Date.now()-updateBlockerAcknowledgedAt>10_000?['Waiting for the app to confirm that your work is saved']:[]),...(service.simulations.busy?['A simulation or simulation save is in progress']:[]),...(service.sync.state.running?['Character sync is in progress']:[]),...(nativeOperations?['A file import, backup, or other file action is in progress']:[])],
    beforeInstall:async()=>{
      saveWindowPlacement?.()
      installingUpdate=true
      try{
        const backup=await db.call('exportBackup')
        await mkdir(resolve(userDir,'backups'),{recursive:true})
        await writeFile(resolve(userDir,'backups','before-update-'+Date.now()+'.json'),JSON.stringify(backup),{encoding:'utf8',mode:0o600})
        await service.close();await db.close();cleanup=undefined;closing=true
      }catch(error){installingUpdate=false;throw error}
    },
    changed:state=>{
      const notice=updateNotice(lastUpdateState,state)
      lastUpdateState=state
      if(notice&&!updateNoticesSent.has(notice.key)){updateNoticesSent.add(notice.key);void onAlert(notice)}
      if(window&&!window.webContents.isDestroyed())window.webContents.send('companion:update-state-changed',state)
    },
  })
  cleanup=async()=>{updates.close();await service.close();await db.close()}
  const rendererRoot=resolve(root,'../renderer')
  protocol.handle('app',async request=>{
    const url=new URL(request.url)
    if(url.host!=='companion')return new Response('Not found',{status:404})
    let path=resolve(rendererRoot,'.'+decodeURIComponent(url.pathname))
    if(path!==rendererRoot&&!path.startsWith(rendererRoot+sep))return new Response('Not found',{status:404})
    if(!extname(path))path=resolve(rendererRoot,'index.html')
    try{const response=await net.fetch(pathToFileURL(path).href);const headers=new Headers(response.headers);headers.set('Content-Security-Policy',CSP);headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers})}catch{return new Response('Not found',{status:404})}
  })
  const assetHeaders=(response:Response,type:string)=>{const headers=new Headers(response.headers);headers.set('Content-Type',type);headers.set('Access-Control-Allow-Origin',devUrl?new URL(devUrl).origin:'app://companion');headers.set('X-Content-Type-Options','nosniff');headers.set('Cache-Control','max-age=86400');return new Response(response.body,{status:response.status,headers})}
  protocol.handle('wow-asset',async request=>{
    const url=new URL(request.url)
    if(url.host==='models'){try{return assetHeaders(await net.fetch(pathToFileURL(service.models.assetPath(url.pathname.slice(1))).href),'model/gltf-binary')}catch{return new Response('Not found',{status:404})}}
    if(url.host==='icons'){const id=Number(url.pathname.match(/^\/(\d+)\.png$/)?.[1]);if(!id)return new Response('Not found',{status:404});try{return assetHeaders(await net.fetch(pathToFileURL(await service.gameData.call('icon',id)).href),'image/png')}catch{return new Response('Not found',{status:404})}}
    if(url.host==='renders'){const name=url.pathname.slice(1);if(!/^[\w-]+\.(png|jpg|webp)$/.test(name))return new Response('Not found',{status:404});try{return assetHeaders(await net.fetch(pathToFileURL(resolve(service.connections.rendersDir(),name)).href),name.endsWith('png')?'image/png':name.endsWith('webp')?'image/webp':'image/jpeg')}catch{return new Response('Not found',{status:404})}}
    return new Response('Not found',{status:404})
  })
  const trusted=(event:Electron.IpcMainInvokeEvent)=>{const url=event.senderFrame?.url;if(!url||!origins.includes(rendererOrigin(url)??'')||event.sender!==window?.webContents)throw new Error('Untrusted application frame')}
  function handle(channel:string,fn:(...args:any[])=>unknown){ipcMain.handle(channel,async(event,...args)=>{
    trusted(event)
    if(installingUpdate&&!['companion:update-state','companion:update-blockers'].includes(channel))throw new Error('The app is restarting to install an update')
    const fileAction=/^companion:(?:import-file|watch-file|export-backup|import-backup|choose-model-file|choose-wow-folder|choose-simulation-executable)$/.test(channel)
    if(fileAction)nativeOperations++
    try{return await fn(...args)}finally{if(fileAction)nativeOperations--}
  })}
  handle('companion:update-state',()=>updates.getState())
  handle('companion:update-check',()=>updates.check())
  handle('companion:update-download',()=>updates.download())
  handle('companion:update-install',()=>updates.install())
  handle('companion:update-channel',(channel:unknown)=>{if(!isUpdateChannel(channel))throw new Error('Choose Stable or Nightly');return updates.setChannel(channel)})
  // A test notice is sent even in test profiles: the player asked for it, so only an unsupported system stops it
  handle('companion:test-alert',()=>{if(!Notification.isSupported())throw new Error('This system doesn\'t support desktop notifications');notify({title:'WOW Companion alerts are on',body:'Click this notice to bring WOW Companion to the front'})})
  handle('companion:update-auto-download',(value:unknown)=>{if(typeof value!=='boolean')throw new Error('Invalid download setting');return updates.setAutoDownload(value)})
  handle('companion:update-blockers',(values:unknown)=>{if(!Array.isArray(values)||values.length>20||values.some(value=>typeof value!=='string'||value.length>160))throw new Error('Invalid pending work');updateBlockerAcknowledgedAt=Date.now();updates.setBlockers(values)})
  async function selectedFile(filters:Electron.FileFilter[],extra:Pick<Electron.OpenDialogOptions,'title'|'defaultPath'>={}){const result=await dialog.showOpenDialog(window!,{...extra,properties:['openFile'],filters});return result.canceled?null:result.filePaths[0]??null}
  async function smallText(path:string){const info=await stat(path);if(!info.isFile()||info.size>16*1024*1024)throw new Error('Choose a file smaller than 16 MiB');return readFile(path,'utf8')}
  handle('companion:connection',()=>service.connection)
  handle('companion:choose-model-file',async(characterId:unknown)=>{if(typeof characterId!=='string'||characterId.length>100)throw Error('Invalid character');const file=await selectedFile([{name:'Self-contained 3D model',extensions:['glb']}]);if(!file)return null;const model=await service.models.importFile(characterId,file);await service.changed(characterId);return model})
  const windowState=():WindowState=>({platform:process.platform==='darwin'?'darwin':process.platform==='win32'?'win32':'linux',frame:windowFrame,controls:process.platform==='darwin'?'native-traffic-lights':'native-overlay',maximized:window?.isMaximized()??false,fullScreen:window?.isFullScreen()??false,focused:window?.isFocused()??false})
  handle('companion:window-state',windowState)
  handle('companion:window-theme',(theme:unknown)=>{if(theme!=='system'&&theme!=='light'&&theme!=='dark')throw new Error('Invalid window theme');nativeTheme.themeSource=theme})
  // Electron cancels a close without a word when the page holds unsaved work, so the page shows its own Save or discard choice instead
  let allowUnload=false
  handle('companion:window-close',()=>{allowUnload=true;window?.close()})
  handle('companion:window-toggle-maximize',()=>{if(window?.isFullScreen())return;if(window?.isMaximized())window.unmaximize();else window?.maximize()})
  handle('companion:import-file',async()=>{const path=await selectedFile([{name:'Addon snapshot',extensions:['lua','json','txt']}]);return path?service.importText(await smallText(path)):null})
  handle('companion:watch-file',async()=>{const path=await selectedFile([{name:'Addon SavedVariables',extensions:['lua','json']}]);if(!path)return null;const canonical=await realpath(path);if(!['.lua','.json'].includes(extname(canonical).toLowerCase()))throw new Error('Choose an addon Lua or JSON snapshot');await service.setWatchPath(canonical);await service.changed();return canonical})
  handle('companion:export-backup',async()=>{const result=await dialog.showSaveDialog(window!,{defaultPath:'wow-companion-backup.json',filters:[{name:'JSON backup',extensions:['json']}]});if(result.canceled||!result.filePath)return false;const backup=await db.call('exportBackup');await writeFile(result.filePath,JSON.stringify(backup,null,2),'utf8');return true})
  handle('companion:import-backup',async()=>{const path=await selectedFile([{name:'JSON backup',extensions:['json']}]);if(!path)return null;const input=JSON.parse(await smallText(path));const result=await db.call('importBackup',input);await service.changed();return {imported:(input.characters as {id:string}[]).map(c=>c.id),unchanged:[],errors:[],revision:result.revision}})
  handle('companion:choose-wow-folder',async()=>{const result=await dialog.showOpenDialog(window!,{title:'Choose your World of Warcraft folder',properties:['openDirectory']});if(result.canceled||!result.filePaths[0])return null;return service.connections.useInstallPath(result.filePaths[0])})
  handle('companion:choose-simulation-executable',async()=>{const local=process.env.LOCALAPPDATA,roots=process.platform==='win32'?[...(local?[join(local,'Programs','SimulationCraft'),join(local,'Programs')]:[]),join(process.env.ProgramFiles??'C:/Program Files','SimulationCraft'),process.env.ProgramFiles??'C:/Program Files',app.getPath('downloads')]:process.platform==='darwin'?['/Applications',app.getPath('downloads')]:['/usr/local/bin','/usr/bin',app.getPath('downloads')];const selected=await selectedFile(process.platform==='win32'?[{name:'SimulationCraft engine (simc.exe)',extensions:['exe']}]:[{name:'SimulationCraft engine (simc)',extensions:['*']}],{title:'Choose the SimulationCraft engine',defaultPath:await service.simulations.engineFolder(roots)});return selected?service.simulations.configureExecutable(await realpath(selected)):null})
  handle('companion:open-external',async(value:unknown)=>{if(typeof value!=='string')throw new Error('Invalid link');const url=new URL(value);if(url.protocol!=='https:'||!['raider.io','www.wowhead.com','worldofwarcraft.blizzard.com','news.blizzard.com','github.com','www.warcraftlogs.com','warcraftlogs.com','raidbots.com','www.raidbots.com','simulationcraft.org','www.simulationcraft.org','develop.battle.net','oauth.battle.net','community.developer.battle.net'].includes(url.hostname))throw new Error('This external link is not supported');await shell.openExternal(url.href)})
  const iconRoot=resolve(app.isPackaged?rendererRoot:app.getAppPath(),app.isPackaged?'assets':'public/assets')
  const iconPath=(variant:AppIconVariant)=>resolve(iconRoot,appIconFiles[variant].png)
  const windowIcon=iconPath(resolveAppIcon(settings.appIcon,app.getVersion()))
  if(process.platform==='win32'&&app.isPackaged&&!process.env.WOW_COMPANION_DATA_DIR)alignShortcutActivator(resolve(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs/WOW Companion.lnk'),process.execPath,identity,shell)
  if(process.platform==='win32'&&!process.env.WOW_COMPANION_HEADLESS)void registerToastIdentity(identity,windowIcon,app.isPackaged?`"${process.execPath}"`:`"${process.execPath}" "${app.getAppPath()}"`)
  const pinnedIcons=resolve(app.getPath('appData'),'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar')
  let iconUpdate:Promise<unknown>=Promise.resolve()
  const applyAppIcon=()=>{
    const next=iconUpdate.catch(()=>{}).then(async()=>{
      const saved=await db.call('getSettings')
      const variant=resolveAppIcon(saved.appIcon,app.getVersion())
      if(process.platform==='darwin')app.dock?.setIcon(iconPath(variant))
      else window?.setIcon(iconPath(variant))
      tray?.setImage(iconPath(variant))
      if(process.platform==='win32'){
        const ico=await persistWindowsIcon(resolve(iconRoot,appIconFiles[variant].ico),resolve(userDir,'app-icons'))
        window?.setAppDetails(taskbarDetails(process.execPath,ico,app.isPackaged?undefined:app.getAppPath()))
        // Acceptance profiles exercise native shortcuts in scratch space, never the real taskbar
        if(!process.env.WOW_COMPANION_DATA_DIR)await updatePinnedAppIcons(pinnedIcons,process.execPath,ico,shell,app.isPackaged?undefined:app.getAppPath(),files=>refreshPinnedShellItems(pinnedIcons,files))
      }
      return variant
    })
    iconUpdate=next
    return next
  }
  handle('companion:apply-app-icon',applyAppIcon)
  if(process.platform==='darwin')app.dock?.setIcon(windowIcon)
  const titleBarOverlay=()=>({color:nativeTheme.shouldUseDarkColors?'#000000':'#f7f8fa',symbolColor:nativeTheme.shouldUseDarkColors?'#f5f5f5':'#1c2430',height:48})
  const placementFile=resolve(userDir,'window-placement.json')
  const placement=readWindowPlacement(placementFile,[screen.getPrimaryDisplay().workArea,...screen.getAllDisplays().filter(display=>display.id!==screen.getPrimaryDisplay().id).map(display=>display.workArea)])
  window=new BrowserWindow({title:identity.displayName,...placement.bounds,...minimumWindowSize,show:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#000000':'#f7f8fa',autoHideMenuBar:true,icon:windowIcon,...(process.platform==='darwin'?{titleBarStyle:'hiddenInset' as const,trafficLightPosition:{x:14,y:16}}:{titleBarStyle:'hidden' as const,titleBarOverlay:titleBarOverlay()}),webPreferences:{preload:resolve(root,'../preload/index.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,offscreen:process.env.WOW_COMPANION_HEADLESS==='1',backgroundThrottling:process.env.WOW_COMPANION_HEADLESS!=='1'}})
  await applyAppIcon().catch(error=>console.warn('Taskbar icon update:',error.message))
  const rememberedWindow=rememberWindowPlacement(window,placementFile,placement)
  saveWindowPlacement=rememberedWindow.save
  const publishWindowState=()=>{if(window&&!window.webContents.isDestroyed())window.webContents.send('companion:window-state-changed',windowState())}
  window.on('maximize',publishWindowState)
  window.on('unmaximize',publishWindowState)
  window.on('enter-full-screen',publishWindowState)
  window.on('leave-full-screen',publishWindowState)
  window.on('focus',publishWindowState)
  window.on('blur',publishWindowState)
  nativeTheme.on('updated',()=>{window?.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#000000':'#f7f8fa');if(process.platform!=='darwin')window?.setTitleBarOverlay(titleBarOverlay())})
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',(event,url)=>{if(!origins.includes(rendererOrigin(url)??''))event.preventDefault()})
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false))
  window.once('ready-to-show',()=>{rememberedWindow.restore();if(!process.env.WOW_COMPANION_HEADLESS)window?.show();void splash?.close();splash=null})
  window.on('closed',()=>{window=null})
  // Page titles name the app; a development window says so, so it is never mistaken for the installed one
  if(!app.isPackaged)window.on('page-title-updated',(event,title)=>{event.preventDefault();window?.setTitle(title.replace(/^WOW Companion(?= |$)/,identity.displayName))})
  // With the tray option on, closing hides the window so syncs and alerts continue; Quit lives in the tray menu
  window.webContents.on('will-prevent-unload',event=>{if(allowUnload){event.preventDefault();return}window?.webContents.send('companion:close-requested')})
  window.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)allowUnload=false})
  window.on('close',event=>{if(keepInTray&&tray&&!quitting&&!installingUpdate){event.preventDefault();window?.hide()}})
  if(!isolated){
    tray=new Tray(windowIcon)
    tray.setToolTip(identity.displayName)
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:`Open ${identity.displayName}`,click:showWindow},
      {label:'Sync characters now',click:()=>void service.sync.run('manual')},
      {type:'separator'},
      {label:'Quit',click:()=>{quitting=true;app.quit()}},
    ]))
    tray.on('click',showWindow)
  }
  splash?.step('Loading your characters',.8)
  if(devUrl)await window.loadURL(devUrl);else await window.loadURL('app://companion/index.html')
  updates.startPolling()
  if(process.argv.includes('--acceptance')){const report=await runDesktopAcceptance({window,db,service,outputDir:resolve(userDir,'acceptance')});console.log('DESKTOP_ACCEPTANCE',JSON.stringify({passed:report.passed,steps:report.steps.map(s=>({name:s.name,status:s.status,detail:s.status==='fail'?s.detail:undefined})),evidence:resolve(userDir,'acceptance/report.json')}));process.exitCode=report.passed?0:1;app.quit()}
  if(process.argv.includes('--smoke')){const result=await window.webContents.executeJavaScript(`new Promise(resolve=>{let n=0;const t=setInterval(()=>{if(document.querySelector('h1')||++n>100){clearInterval(t);resolve({title:document.title,heading:document.querySelector('h1')?.textContent,body:document.body.innerText.slice(0,500)})}},100)})`);console.log('COMPANION_SMOKE',JSON.stringify(result));app.quit()}
}
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',event=>{quitting=true;saveWindowPlacement?.();if(cleanup&&!closing){event.preventDefault();closing=true;void cleanup().finally(()=>{cleanup=undefined;app.exit(Number(process.exitCode??0))})}})
// One copy per data folder: a second launch focuses the open window instead of sharing the database and item data files
if(!app.requestSingleInstanceLock())app.quit()
else{
app.on('second-instance',()=>{if(!window)return;if(window.isMinimized())window.restore();window.show();window.focus()})
app.whenReady().then(main).catch(error=>{console.error('WOW Companion could not start',error);void splash?.close();splash=null;process.exitCode=1;if(process.env.WOW_COMPANION_HEADLESS!=='1')dialog.showErrorBox('WOW Companion could not start',error instanceof Error?error.message:String(error));app.quit()})
}
