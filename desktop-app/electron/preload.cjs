const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    parseLinks: (inputText) => ipcRenderer.invoke('parse-links', inputText),
    auditLinks: (links, browser) => ipcRenderer.invoke('audit-links', links, browser),
    startDownload: (payloadOrUrl, browser) => ipcRenderer.invoke('start-download', payloadOrUrl, browser)
})
