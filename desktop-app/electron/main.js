const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true
    })

    // In Dev mode, load from Vite dev server
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
        // mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

// IPC Handler to start real download
ipcMain.handle('start-download', async (event, url, browser) => {
    return new Promise((resolve) => {
        // We use the pipx-installed globally available gallery-dl
        // In a final production app, we would bundle the gallery-dl binary
        const outputDir = path.join(app.getPath('downloads'), 'InstaBatch')

        // Command: gallery-dl --cookies-from-browser <browser> -d <dir> <url>
        const dlProcess = spawn('gallery-dl', [
            '--cookies-from-browser', browser,
            '-d', outputDir,
            url
        ])

        dlProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`)
        })

        dlProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`)
        })

        dlProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, url })
            } else {
                resolve({ success: false, url, error: `Process exited with code ${code}` })
            }
        })

        dlProcess.on('error', (err) => {
            resolve({ success: false, url, error: err.message })
        })
    })
})
