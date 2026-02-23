const { contextBridge, ipcRenderer, clipboard } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    parseLinks: (inputText) => ipcRenderer.invoke('parse-links', inputText),
    auditLinks: (links, browser) => ipcRenderer.invoke('audit-links', links, browser),
    startDownload: (payloadOrUrl, browser) => ipcRenderer.invoke('start-download', payloadOrUrl, browser),
    exportAuditReport: (payload) => ipcRenderer.invoke('export-audit-report', payload),
    readClipboardText: () => clipboard.readText(),
    toolsStatus: () => ipcRenderer.invoke('tools-status'),
    startDownloadBatch: (payload) => ipcRenderer.invoke('download-batch-start', payload),
    cancelDownloadBatch: (batchId) => ipcRenderer.invoke('download-batch-cancel', batchId),
    onDownloadBatchProgress: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('download-batch-progress', listener)
        return () => ipcRenderer.removeListener('download-batch-progress', listener)
    },
    onDownloadBatchDone: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('download-batch-done', listener)
        return () => ipcRenderer.removeListener('download-batch-done', listener)
    }
})
