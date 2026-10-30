import type { ImportReport } from './domain'
import type { GameDataStatus } from './gamedata'
import type { UpdateChannel, UpdateState } from './updates'

export type ConnectionInfo = { url:string;token:string }
export type WindowState = {
  platform:'darwin'|'win32'|'linux'
  frame:'custom'|'native'
  controls:'native-overlay'|'native-traffic-lights'
  maximized:boolean
  fullScreen:boolean
  focused:boolean
}
export type NativeBridge = {
  updateState():Promise<UpdateState>
  checkForUpdates():Promise<UpdateState>
  downloadUpdate():Promise<UpdateState>
  installUpdate():Promise<UpdateState>
  setUpdateChannel(channel:UpdateChannel):Promise<UpdateState>
  setUpdateBlockers(blockers:string[]):Promise<void>
  onUpdateState(listener:(state:UpdateState)=>void):()=>void
  windowState():Promise<WindowState>
  onWindowState(listener:(state:WindowState)=>void):()=>void
  setWindowTheme(theme:'system'|'light'|'dark'):Promise<void>
  toggleMaximizeWindow():Promise<void>
  connection():Promise<ConnectionInfo>
  chooseImportFile():Promise<ImportReport|null>
  chooseWatchFile():Promise<string|null>
  exportBackup():Promise<boolean>
  importBackup():Promise<ImportReport|null>
  chooseWowFolder():Promise<GameDataStatus|null>
  chooseSimulationExecutable():Promise<{configured:true;name:string}|null>
  chooseModelFile(characterId:string):Promise<import('../main/models/cache').ModelDescriptor|null>
  openExternal(url:string):Promise<void>
}
declare global { interface Window { companion?: NativeBridge } }
