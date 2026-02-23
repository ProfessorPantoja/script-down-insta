const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    startDownload: (url, browser) => ipcRenderer.invoke('start-download', url, browser)
})
