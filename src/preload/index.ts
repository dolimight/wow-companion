import { contextBridge, ipcRenderer } from 'electron'
import type { NativeBridge, WindowState } from '../shared/bridge'

const bridge:NativeBridge={
  windowState:()=>ipcRenderer.invoke('companion:window-state'),
  onWindowState:(listener)=>{
    const receive=(_event:Electron.IpcRendererEvent,state:WindowState)=>listener(state)
    ipcRenderer.on('companion:window-state-changed',receive)
    return ()=>ipcRenderer.removeListener('companion:window-state-changed',receive)
  },
  setWindowTheme:(theme)=>ipcRenderer.invoke('companion:window-theme',theme),
  toggleMaximizeWindow:()=>ipcRenderer.invoke('companion:window-toggle-maximize'),
  connection:()=>ipcRenderer.invoke('companion:connection'),
  chooseImportFile:()=>ipcRenderer.invoke('companion:import-file'),
  chooseWatchFile:()=>ipcRenderer.invoke('companion:watch-file'),
  exportBackup:()=>ipcRenderer.invoke('companion:export-backup'),
  importBackup:()=>ipcRenderer.invoke('companion:import-backup'),
  chooseWowFolder:()=>ipcRenderer.invoke('companion:choose-wow-folder'),
  chooseSimulationExecutable:()=>ipcRenderer.invoke('companion:choose-simulation-executable'),
  chooseModelFile:(characterId)=>ipcRenderer.invoke('companion:choose-model-file',characterId),
  openExternal:(url)=>ipcRenderer.invoke('companion:open-external',url),
}
contextBridge.exposeInMainWorld('companion',bridge)
