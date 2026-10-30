const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fbxConverter', {
  readInput: () => ipcRenderer.invoke('fbx:read-input'),
  options: () => ipcRenderer.invoke('fbx-converter:options'),
  complete: (bytes, summary) => ipcRenderer.invoke('fbx:complete', bytes, summary),
  fail: (message) => ipcRenderer.invoke('fbx:fail', String(message)),
})
