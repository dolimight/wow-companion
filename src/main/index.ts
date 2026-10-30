import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, safeStorage, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseClient } from './database'
import { startLocalService } from './local-service'
import { refreshPublicCharacter } from './provider-refresh'
import { rendererOrigin } from './renderer-origin'
import { runDesktopAcceptance } from './desktop-acceptance'
import { EncryptedFileStore } from './secrets'
import type { WindowState } from '../shared/bridge'

// Test profiles isolate Chromium caches as well as SQLite, including alongside dev mode
if(process.env.WOW_COMPANION_DATA_DIR){const testProfile=resolve(process.env.WOW_COMPANION_DATA_DIR);mkdirSync(testProfile,{recursive:true});app.setPath('userData',testProfile);app.setPath('sessionData',testProfile)}

protocol.registerSchemesAsPrivileged([
  {scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}},
  {scheme:'wow-asset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},
])
const root=dirname(fileURLToPath(import.meta.url))
let window:BrowserWindow|null=null
let cleanup:(()=>Promise<void>)|undefined
let closing=false
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: wow-asset:; connect-src 'self' blob: data: ws://127.0.0.1:* wow-asset:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"
async function main(){
  const userDir=process.env.WOW_COMPANION_DATA_DIR?resolve(process.env.WOW_COMPANION_DATA_DIR):app.getPath('userData')
  await mkdir(userDir,{recursive:true})
  const db=new DatabaseClient(resolve(userDir,'companion.sqlite'))
  const settings=await db.call('getSettings')
  nativeTheme.themeSource=settings.theme
  const windowFrame='custom' as const
  const devUrl=process.env.ELECTRON_RENDERER_URL
  const origins=['app://companion',...(devUrl?[new URL(devUrl).origin]:[])]
  const secrets=new EncryptedFileStore(resolve(userDir,'secrets.json'),{available:()=>safeStorage.isEncryptionAvailable(),encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)})
  const addonDir=app.isPackaged?resolve(process.resourcesPath,'addon'):resolve(app.getAppPath(),'addon')
  const service=await startLocalService({db,origins,refreshCharacter:id=>refreshPublicCharacter(db,id),gameDataDir:resolve(userDir,'gamedata'),secrets,addonDir,assetsDir:userDir,autoSync:!process.env.WOW_COMPANION_DATA_DIR})
  cleanup=async()=>{await service.close();await db.close()}
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
  function handle(channel:string,fn:(...args:any[])=>unknown){ipcMain.handle(channel,async(event,...args)=>{trusted(event);return fn(...args)})}
  async function selectedFile(filters:Electron.FileFilter[]){const result=await dialog.showOpenDialog(window!,{properties:['openFile'],filters});return result.canceled?null:result.filePaths[0]??null}
  async function smallText(path:string){const info=await stat(path);if(!info.isFile()||info.size>16*1024*1024)throw new Error('Choose a file smaller than 16 MiB');return readFile(path,'utf8')}
  handle('companion:connection',()=>service.connection)
  handle('companion:choose-model-file',async(characterId:unknown)=>{if(typeof characterId!=='string'||characterId.length>100)throw Error('Invalid character');const file=await selectedFile([{name:'Self-contained 3D model',extensions:['glb']}]);if(!file)return null;const model=await service.models.importFile(characterId,file);await service.changed(characterId);return model})
  const windowState=():WindowState=>({platform:process.platform==='darwin'?'darwin':process.platform==='win32'?'win32':'linux',frame:windowFrame,controls:process.platform==='darwin'?'native-traffic-lights':'native-overlay',maximized:window?.isMaximized()??false,fullScreen:window?.isFullScreen()??false,focused:window?.isFocused()??false})
  handle('companion:window-state',windowState)
  handle('companion:window-theme',(theme:unknown)=>{if(theme!=='system'&&theme!=='light'&&theme!=='dark')throw new Error('Invalid window theme');nativeTheme.themeSource=theme})
  handle('companion:window-toggle-maximize',()=>{if(window?.isFullScreen())return;if(window?.isMaximized())window.unmaximize();else window?.maximize()})
  handle('companion:import-file',async()=>{const path=await selectedFile([{name:'Addon snapshot',extensions:['lua','json','txt']}]);return path?service.importText(await smallText(path)):null})
  handle('companion:watch-file',async()=>{const path=await selectedFile([{name:'Addon SavedVariables',extensions:['lua','json']}]);if(!path)return null;const canonical=await realpath(path);if(!['.lua','.json'].includes(extname(canonical).toLowerCase()))throw new Error('Choose an addon Lua or JSON snapshot');await service.setWatchPath(canonical);await service.changed();return canonical})
  handle('companion:export-backup',async()=>{const result=await dialog.showSaveDialog(window!,{defaultPath:'wow-companion-backup.json',filters:[{name:'JSON backup',extensions:['json']}]});if(result.canceled||!result.filePath)return false;const backup=await db.call('exportBackup');await writeFile(result.filePath,JSON.stringify(backup,null,2),'utf8');return true})
  handle('companion:import-backup',async()=>{const path=await selectedFile([{name:'JSON backup',extensions:['json']}]);if(!path)return null;const input=JSON.parse(await smallText(path));const result=await db.call('importBackup',input);await service.changed();return {imported:(input.characters as {id:string}[]).map(c=>c.id),unchanged:[],errors:[],revision:result.revision}})
  handle('companion:choose-wow-folder',async()=>{const result=await dialog.showOpenDialog(window!,{title:'Choose your World of Warcraft folder',properties:['openDirectory']});if(result.canceled||!result.filePaths[0])return null;return service.connections.useInstallPath(result.filePaths[0])})
  handle('companion:choose-simulation-executable',async()=>{const selected=await selectedFile(process.platform==='win32'?[{name:'SimulationCraft executable',extensions:['exe']}]:[{name:'SimulationCraft',extensions:['*']}]);return selected?service.simulations.configureExecutable(await realpath(selected)):null})
  handle('companion:open-external',async(value:unknown)=>{if(typeof value!=='string')throw new Error('Invalid link');const url=new URL(value);if(url.protocol!=='https:'||!['raider.io','www.wowhead.com','worldofwarcraft.blizzard.com','news.blizzard.com','github.com','www.warcraftlogs.com','warcraftlogs.com','raidbots.com','www.raidbots.com','simulationcraft.org','www.simulationcraft.org','develop.battle.net','oauth.battle.net','community.developer.battle.net'].includes(url.hostname))throw new Error('This external link is not supported');await shell.openExternal(url.href)})
  const windowIcon=resolve(app.isPackaged?rendererRoot:app.getAppPath(),app.isPackaged?'assets/wow-companion-icon.png':'public/assets/wow-companion-icon.png')
  if(process.platform==='win32')app.setAppUserModelId('local.wowcompanion.desktop')
  if(process.platform==='darwin')app.dock?.setIcon(windowIcon)
  const titleBarOverlay=()=>({color:nativeTheme.shouldUseDarkColors?'#000000':'#f7f8fa',symbolColor:nativeTheme.shouldUseDarkColors?'#f5f5f5':'#1c2430',height:48})
  window=new BrowserWindow({title:'WOW Companion',width:1460,height:1050,minWidth:820,minHeight:650,show:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#000000':'#f7f8fa',autoHideMenuBar:true,icon:windowIcon,...(process.platform==='darwin'?{titleBarStyle:'hiddenInset' as const,trafficLightPosition:{x:14,y:16}}:{titleBarStyle:'hidden' as const,titleBarOverlay:titleBarOverlay()}),webPreferences:{preload:resolve(root,'../preload/index.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,offscreen:process.env.WOW_COMPANION_HEADLESS==='1',backgroundThrottling:process.env.WOW_COMPANION_HEADLESS!=='1'}})
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
  window.once('ready-to-show',()=>{if(!process.env.WOW_COMPANION_HEADLESS)window?.show()})
  window.on('closed',()=>{window=null})
  if(devUrl)await window.loadURL(devUrl);else await window.loadURL('app://companion/index.html')
  if(process.argv.includes('--acceptance')){const report=await runDesktopAcceptance({window,db,service,outputDir:resolve(userDir,'acceptance')});console.log('DESKTOP_ACCEPTANCE',JSON.stringify({passed:report.passed,steps:report.steps.map(s=>({name:s.name,status:s.status,detail:s.status==='fail'?s.detail:undefined})),evidence:resolve(userDir,'acceptance/report.json')}));process.exitCode=report.passed?0:1;app.quit()}
  if(process.argv.includes('--smoke')){const result=await window.webContents.executeJavaScript(`new Promise(resolve=>{let n=0;const t=setInterval(()=>{if(document.querySelector('h1')||++n>100){clearInterval(t);resolve({title:document.title,heading:document.querySelector('h1')?.textContent,body:document.body.innerText.slice(0,500)})}},100)})`);console.log('COMPANION_SMOKE',JSON.stringify(result));app.quit()}
}
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',event=>{if(cleanup&&!closing){event.preventDefault();closing=true;void cleanup().finally(()=>{cleanup=undefined;app.exit(Number(process.exitCode??0))})}})
app.whenReady().then(main).catch(error=>{console.error('WOW Companion could not start',error);process.exitCode=1;if(process.env.WOW_COMPANION_HEADLESS!=='1')dialog.showErrorBox('WOW Companion could not start',error instanceof Error?error.message:String(error));app.quit()})
