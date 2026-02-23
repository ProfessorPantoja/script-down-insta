const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs/promises')
const { resolveBinary } = require('./binaries.cjs')

if (process.env.ELECTRON_RUN_AS_NODE) {
    console.error(
        'electron/main.cjs não pode rodar com ELECTRON_RUN_AS_NODE habilitado.\n' +
        'Remova essa variável do ambiente e execute via Electron.'
    )
    process.exit(1)
}

if (!process.versions || !process.versions.electron) {
    console.error(
        'electron/main.cjs precisa ser executado dentro do Electron.\n' +
        'Dica: verifique se a variável de ambiente ELECTRON_RUN_AS_NODE está setada.'
    )
    process.exit(1)
}

app.disableHardwareAcceleration()

let mainWindow
const DOWNLOAD_DIR = path.join(app.getPath('downloads'), 'InstaBatch')

const toolCache = {
    galleryDl: null,
    ytDlp: null
}

function spawnDetached(command, args) {
    try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
        return { ok: true, command, args }
    } catch (error) {
        return { ok: false, command, args, error: error?.message || String(error) }
    }
}

async function openFolderBestEffort(folderPath) {
    try {
        await fs.mkdir(folderPath, { recursive: true })
    } catch { }

    if (process.platform === 'linux') {
        return spawnDetached('xdg-open', [folderPath])
    }
    if (process.platform === 'win32') {
        return spawnDetached('explorer.exe', [folderPath])
    }
    if (process.platform === 'darwin') {
        return spawnDetached('open', [folderPath])
    }

    try {
        const result = await shell.openPath(folderPath)
        if (result) return { ok: false, error: result, command: 'shell.openPath', args: [folderPath] }
        return { ok: true, command: 'shell.openPath', args: [folderPath] }
    } catch (error) {
        return { ok: false, error: error?.message || String(error), command: 'shell.openPath', args: [folderPath] }
    }
}

async function getGalleryDlPath() {
    if (toolCache.galleryDl !== null) return toolCache.galleryDl
    toolCache.galleryDl = await resolveBinary('gallery-dl', 'GALLERY_DL_PATH')
    return toolCache.galleryDl
}

async function getYtDlpPath() {
    if (toolCache.ytDlp !== null) return toolCache.ytDlp
    toolCache.ytDlp = await resolveBinary('yt-dlp', 'YTDLP_PATH')
    return toolCache.ytDlp
}

const SUPPORTED_PLATFORMS = ['instagram', 'tiktok', 'twitter', 'kwai']
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'])
const SHORTENER_HOSTS = new Set(['bit.ly', 'www.bit.ly', 't.co', 'tinyurl.com', 'is.gd', 'cutt.ly', 'buff.ly'])

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 760,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true
    })

    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173')
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

function normalizeUrl(rawUrl) {
    let normalized = String(rawUrl || '').trim()
    normalized = normalized.replace(/[)\],.;!?]+$/g, '')
    try {
        const parsed = new URL(normalized)
        parsed.hash = ''
        const platform = detectPlatform(parsed.toString())
        if (platform !== 'unknown') {
            parsed.search = ''
        }
        normalized = parsed.toString()
    } catch {
        return normalized
    }
    return normalized
}

function csvEscape(value) {
    const text = String(value ?? '')
    if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
        return `"${text.replace(/"/g, '""')}"`
    }
    return text
}

function nowStamp() {
    const date = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

function detectPlatform(urlString) {
    try {
        const parsed = new URL(urlString)
        const hostname = parsed.hostname.toLowerCase()
        if (hostname.includes('instagram.com')) return 'instagram'
        if (hostname.includes('tiktok.com')) return 'tiktok'
        if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname.includes('twitter.com')) return 'twitter'
        if (hostname.includes('kwai-video.com') || hostname.includes('kwai.com')) return 'kwai'
        return 'unknown'
    } catch {
        return 'unknown'
    }
}

async function extractLinks(inputText) {
    const rawUrls = String(inputText || '').match(/https?:\/\/[^\s<>"'\\]+/g) || []
    const deduped = new Map()
    for (const rawUrl of rawUrls) {
        const normalized = normalizeUrl(rawUrl)
        if (!deduped.has(normalized)) {
            deduped.set(normalized, { url: normalized, platform: detectPlatform(normalized), originalUrl: normalized })
        }
    }

    const allLinks = Array.from(deduped.values())
    for (const item of allLinks) {
        if (item.platform !== 'unknown') continue
        if (!isShortener(item.url)) continue
        const resolvedUrl = await resolveShortUrl(item.url)
        item.url = normalizeUrl(resolvedUrl)
        item.platform = detectPlatform(item.url)
    }

    const finalDeduped = new Map()
    for (const item of allLinks) {
        if (!finalDeduped.has(item.url)) {
            finalDeduped.set(item.url, item)
        }
    }
    const uniqueLinks = Array.from(finalDeduped.values())
    const supported = uniqueLinks.filter((item) => SUPPORTED_PLATFORMS.includes(item.platform))
    const unsupported = uniqueLinks.filter((item) => item.platform === 'unknown')

    return {
        links: supported,
        unsupportedLinks: unsupported.map((item) => item.originalUrl || item.url),
        totals: {
            extracted: rawUrls.length,
            unique: uniqueLinks.length,
            supported: supported.length,
            unsupported: unsupported.length
        }
    }
}

function isShortener(urlString) {
    try {
        const hostname = new URL(urlString).hostname.toLowerCase()
        return SHORTENER_HOSTS.has(hostname)
    } catch {
        return false
    }
}

async function resolveShortUrl(urlString) {
    const doRequest = async (method) => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4500)
        try {
            const response = await fetch(urlString, {
                method,
                redirect: 'follow',
                signal: controller.signal
            })
            return response.url ? normalizeUrl(response.url) : urlString
        } catch {
            return urlString
        } finally {
            clearTimeout(timeout)
        }
    }

    const headResolved = await doRequest('HEAD')
    if (headResolved !== urlString) {
        return headResolved
    }
    return doRequest('GET')
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, { windowsHide: true })
        let stdout = ''
        let stderr = ''
        let timedOut = false

        const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 0
        const timeout = timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true
                try {
                    proc.kill('SIGTERM')
                } catch { }
            }, timeoutMs)
            : null

        if (typeof options.onProcess === 'function') {
            try {
                options.onProcess(proc)
            } catch { }
        }

        proc.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        proc.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        proc.on('close', (code) => {
            if (timeout) clearTimeout(timeout)
            resolve({
                ok: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: timedOut ? `Timeout após ${timeoutMs}ms` : stderr.trim()
            })
        })

        proc.on('error', (error) => {
            if (timeout) clearTimeout(timeout)
            resolve({
                ok: false,
                code: -1,
                stdout: '',
                stderr: error.message
            })
        })
    })
}

function classifySingleInfo(info) {
    if (!info || typeof info !== 'object') return 'unknown'

    if (Array.isArray(info.entries) && info.entries.length > 0) {
        const entryTypes = info.entries.map(classifySingleInfo).filter((type) => type !== 'unknown')
        if (entryTypes.length === 0) return 'unknown'
        if (entryTypes.every((type) => type === entryTypes[0])) return entryTypes[0]
        return 'mixed'
    }

    if (typeof info.vcodec === 'string' && info.vcodec !== 'none') {
        return 'video'
    }

    if (typeof info.duration === 'number' && info.duration > 0) {
        return 'video'
    }

    if (typeof info.ext === 'string' && IMAGE_EXTENSIONS.has(info.ext.toLowerCase())) {
        return 'image'
    }

    if (
        typeof info.width === 'number' &&
        typeof info.height === 'number' &&
        (!info.vcodec || info.vcodec === 'none') &&
        !info.duration
    ) {
        return 'image'
    }

    return 'unknown'
}

function fallbackMediaType(url, platform) {
    const lowerUrl = url.toLowerCase()
    if (platform === 'kwai') return 'video'
    if (platform === 'tiktok') return lowerUrl.includes('/photo/') ? 'image' : 'video'
    if (platform === 'instagram') {
        if (lowerUrl.includes('/reel/') || lowerUrl.includes('/tv/')) return 'video'
        if (lowerUrl.includes('/p/') || lowerUrl.includes('/stories/')) return 'mixed'
        return 'mixed'
    }
    if (platform === 'twitter') return 'unknown'
    return 'unknown'
}

async function probeMedia(url, browser, options = {}) {
    const ytDlpPath = await getYtDlpPath()
    if (!ytDlpPath) {
        const platform = detectPlatform(url)
        return {
            url,
            platform,
            mediaType: fallbackMediaType(url, platform),
            source: 'fallback',
            ok: false,
            error: 'yt-dlp não encontrado (instale ou defina YTDLP_PATH)'
        }
    }

    const args = ['--skip-download', '--dump-single-json', '--no-warnings']
    if (browser) {
        args.push('--cookies-from-browser', browser)
    }
    args.push(url)

    const probe = await runCommand(ytDlpPath, args, {
        timeoutMs: typeof options.timeoutMs === 'number' ? options.timeoutMs : 20000,
        onProcess: options.onProcess
    })
    if (!probe.ok || !probe.stdout) {
        const platform = detectPlatform(url)
        return {
            url,
            platform,
            mediaType: fallbackMediaType(url, platform),
            source: 'fallback',
            ok: false,
            error: probe.stderr || 'yt-dlp probe failed'
        }
    }

    try {
        const info = JSON.parse(probe.stdout)
        const mediaType = classifySingleInfo(info)
        return {
            url,
            platform: detectPlatform(url),
            mediaType,
            source: 'yt-dlp',
            ok: true
        }
    } catch {
        const platform = detectPlatform(url)
        return {
            url,
            platform,
            mediaType: fallbackMediaType(url, platform),
            source: 'fallback',
            ok: false,
            error: 'Unable to parse metadata JSON'
        }
    }
}

async function downloadMedia({ url, browser, saveMode, timeoutMs, onProcess }) {
    const outputDir = DOWNLOAD_DIR
    const normalizedUrl = normalizeUrl(url)
    const platform = detectPlatform(normalizedUrl)
    const perItemTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 180000

    if (platform === 'kwai') {
        const ytDlpPath = await getYtDlpPath()
        if (!ytDlpPath) {
            return {
                success: false,
                url: normalizedUrl,
                platform,
                tool: 'yt-dlp',
                error: 'yt-dlp não encontrado (instale ou defina YTDLP_PATH)'
            }
        }

        const targetDir = saveMode === 'misturado' ? path.join(outputDir, 'misturado') : outputDir
        const args = ['--no-warnings', '--no-progress', '--force-overwrites', '--output-na-placeholder', 'na']
        if (browser) {
            args.push('--cookies-from-browser', browser)
        }
        args.push('-P', targetDir)

        if (saveMode === 'perfil') {
            args.push(
                '-o',
                '%(uploader).40B/%(title).90B [%(id).24B].%(ext)s'
            )
        } else {
            args.push(
                '-o',
                '%(title).90B [%(id).24B].%(ext)s'
            )
        }

        args.push(normalizedUrl)
        const result = await runCommand(ytDlpPath, args, { timeoutMs: perItemTimeoutMs, onProcess })
        return {
            success: result.ok,
            url: normalizedUrl,
            platform,
            tool: 'yt-dlp',
            error: result.ok ? undefined : (result.stderr || `Process exited with code ${result.code}`)
        }
    }

    const galleryDlPath = await getGalleryDlPath()
    if (!galleryDlPath) {
        return {
            success: false,
            url: normalizedUrl,
            platform,
            tool: 'gallery-dl',
            error: 'gallery-dl não encontrado (instale ou defina GALLERY_DL_PATH)'
        }
    }

    const args = []
    if (browser) {
        args.push('--cookies-from-browser', browser)
    }
    args.push('--no-input')
    args.push('--no-skip')
    if (saveMode === 'misturado') {
        args.push('-D', path.join(outputDir, 'misturado'), normalizedUrl)
    } else {
        args.push('-d', outputDir, normalizedUrl)
    }

    const result = await runCommand(galleryDlPath, args, { timeoutMs: perItemTimeoutMs, onProcess })
    return {
        success: result.ok,
        url: normalizedUrl,
        platform,
        tool: 'gallery-dl',
        error: result.ok ? undefined : (result.stderr || `Process exited with code ${result.code}`)
    }
}

function makeBatchId() {
    return `${nowStamp()}_${Math.random().toString(16).slice(2)}`
}

const activeBatches = new Map()

async function startDownloadBatch({ links, browser, saveMode, concurrency, retries, timeoutMs, openFolderOnFinish }) {
    const targets = Array.isArray(links) ? links.filter(Boolean) : []
    const batchId = makeBatchId()

    const limit = Math.max(1, Math.min(Number(concurrency) || 3, 5))
    const maxRetries = Math.max(0, Math.min(Number(retries) || 0, 5))
    const perItemTimeoutMs = Math.max(15000, Math.min(Number(timeoutMs) || 180000, 600000))
    const shouldOpenFolder = Boolean(openFolderOnFinish)

    const batch = {
        id: batchId,
        cancelled: false,
        total: targets.length,
        completed: 0,
        procs: new Set(),
        queue: targets.slice(),
        sendProgress: null,
        sendDone: null,
        shouldOpenFolder
    }
    activeBatches.set(batchId, batch)

    if (batch.total === 0) {
        activeBatches.delete(batchId)
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-batch-done', { batchId, cancelled: false, outputDir: DOWNLOAD_DIR })
        }
        return { ok: true, batchId, total: 0, outputDir: DOWNLOAD_DIR }
    }

    const sendProgress = (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-batch-progress', payload)
        }
    }

    const sendDone = (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-batch-done', payload)
        }
    }

    batch.sendProgress = sendProgress
    batch.sendDone = sendDone

    const worker = async (url) => {
        const normalized = normalizeUrl(url)

        if (batch.cancelled) {
            return {
                url: normalized,
                success: false,
                platform: detectPlatform(normalized),
                error: 'Cancelado'
            }
        }

        let lastError = ''
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (batch.cancelled) {
                lastError = 'Cancelado'
                break
            }

            const result = await downloadMedia({
                url: normalized,
                browser,
                saveMode,
                timeoutMs: perItemTimeoutMs,
                onProcess: (proc) => {
                    batch.procs.add(proc)
                    proc.once('close', () => batch.procs.delete(proc))
                }
            })
            if (result.success) return result

            lastError = result.error || 'Falha no download'
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }

        return {
            success: false,
            url: normalized,
            platform: detectPlatform(normalized),
            tool: detectPlatform(normalized) === 'kwai' ? 'yt-dlp' : 'gallery-dl',
            error: lastError || 'Falha no download'
        }
    }

    let running = 0

    const pump = async () => {
        while (!batch.cancelled && running < limit && batch.queue.length > 0) {
            const nextUrl = batch.queue.shift()
            if (!nextUrl) continue
            running += 1
            const startedUrl = normalizeUrl(nextUrl)
            sendProgress({
                batchId,
                completed: batch.completed,
                total: batch.total,
                item: {
                    phase: 'started',
                    url: startedUrl,
                    platform: detectPlatform(startedUrl)
                }
            })

            ; (async () => {
                let itemResult
                try {
                    itemResult = await worker(nextUrl)
                } catch (error) {
                    itemResult = {
                        success: false,
                        url: normalizeUrl(nextUrl),
                        platform: detectPlatform(nextUrl),
                        tool: detectPlatform(nextUrl) === 'kwai' ? 'yt-dlp' : 'gallery-dl',
                        error: error?.message || String(error)
                    }
                }

                batch.completed += 1
                sendProgress({
                    batchId,
                    completed: batch.completed,
                    total: batch.total,
                    item: itemResult
                })

                running -= 1
                if (batch.completed >= batch.total) {
                    activeBatches.delete(batchId)
                    let openFolder = null
                    if (!batch.cancelled && batch.shouldOpenFolder) {
                        openFolder = await openFolderBestEffort(DOWNLOAD_DIR)
                    }
                    sendDone({ batchId, cancelled: batch.cancelled, outputDir: DOWNLOAD_DIR, openFolder })
                    return
                }
                await pump()
            })()
        }
    }

    await pump()
    return { ok: true, batchId, total: batch.total, outputDir: DOWNLOAD_DIR }
}

function cancelDownloadBatch(batchId) {
    const batch = activeBatches.get(batchId)
    if (!batch) return { ok: false, error: 'Batch não encontrado' }
    batch.cancelled = true

    while (batch.queue && batch.queue.length > 0) {
        const url = normalizeUrl(batch.queue.shift())
        batch.completed += 1
        const item = {
            success: false,
            url,
            platform: detectPlatform(url),
            tool: detectPlatform(url) === 'kwai' ? 'yt-dlp' : 'gallery-dl',
            error: 'Cancelado'
        }
        if (typeof batch.sendProgress === 'function') {
            batch.sendProgress({
                batchId: batch.id,
                completed: batch.completed,
                total: batch.total,
                item
            })
        }
    }

    for (const proc of batch.procs) {
        try {
            proc.kill('SIGTERM')
        } catch { }
    }

    if (batch.completed >= batch.total) {
        activeBatches.delete(batchId)
        if (typeof batch.sendDone === 'function') {
            batch.sendDone({ batchId: batch.id, cancelled: true, outputDir: DOWNLOAD_DIR })
        }
    }
    return { ok: true }
}

ipcMain.handle('export-audit-report', async (_event, payload) => {
    try {
        const safePayload = payload && typeof payload === 'object' ? payload : {}
        const summary = safePayload.summary || {}
        const rows = Array.isArray(safePayload.rows) ? safePayload.rows : []
        const unsupported = Array.isArray(safePayload.unsupportedLinks) ? safePayload.unsupportedLinks : []
        const defaultName = `auditoria_links_${nowStamp()}.csv`

        const saveResult = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportar auditoria de links',
            defaultPath: path.join(app.getPath('downloads'), defaultName),
            filters: [
                { name: 'CSV', extensions: ['csv'] },
                { name: 'Texto', extensions: ['txt'] }
            ]
        })

        if (saveResult.canceled || !saveResult.filePath) {
            return { ok: false, cancelled: true }
        }

        const filePath = saveResult.filePath
        const lower = filePath.toLowerCase()
        const wantsTxt = lower.endsWith('.txt')

        if (wantsTxt) {
            const lines = []
            lines.push(`Total links suportados: ${summary.supported ?? rows.length}`)
            lines.push(`Total links não suportados: ${summary.unsupported ?? unsupported.length}`)
            lines.push('')
            lines.push('=== LINKS SUPORTADOS ===')
            for (const row of rows) {
                lines.push(
                    `${row.index}. [${row.platform}] [${row.mediaType}] [${row.selected ? 'Selecionado' : 'Fora da seleção'}] ${row.url}`
                )
            }
            if (unsupported.length > 0) {
                lines.push('')
                lines.push('=== LINKS NÃO SUPORTADOS ===')
                for (const [index, link] of unsupported.entries()) {
                    lines.push(`${index + 1}. ${link}`)
                }
            }
            await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
            return { ok: true, path: filePath, format: 'txt' }
        }

        const csvLines = []
        csvLines.push('index,platform,media_type,selected,url')
        for (const row of rows) {
            csvLines.push([
                csvEscape(row.index ?? ''),
                csvEscape(row.platform ?? ''),
                csvEscape(row.mediaType ?? ''),
                csvEscape(row.selected ? 'yes' : 'no'),
                csvEscape(row.url ?? '')
            ].join(','))
        }
        if (unsupported.length > 0) {
            csvLines.push('')
            csvLines.push('unsupported_links')
            for (const link of unsupported) {
                csvLines.push(csvEscape(link))
            }
        }
        await fs.writeFile(filePath, `${csvLines.join('\n')}\n`, 'utf8')
        return { ok: true, path: filePath, format: 'csv' }
    } catch (error) {
        return {
            ok: false,
            cancelled: false,
            error: error?.message || String(error)
        }
    }
})

app.whenReady().then(() => {
    createWindow()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('parse-links', async (_event, inputText) => {
    return await extractLinks(inputText)
})

ipcMain.handle('audit-links', async (_event, links, browser) => {
    const targets = Array.isArray(links) ? links : []
    const results = []
    for (const link of targets) {
        results.push(await probeMedia(link, browser))
    }
    return { results }
})

ipcMain.handle('start-download', async (_event, payloadOrUrl, legacyBrowser) => {
    if (typeof payloadOrUrl === 'string') {
        return downloadMedia({
            url: payloadOrUrl,
            browser: legacyBrowser || '',
            saveMode: 'perfil'
        })
    }

    const payload = payloadOrUrl || {}
    return downloadMedia({
        url: payload.url || '',
        browser: payload.browser || '',
        saveMode: payload.saveMode || 'perfil'
    })
})

ipcMain.handle('tools-status', async () => {
    const [galleryDl, ytDlp] = await Promise.all([getGalleryDlPath(), getYtDlpPath()])
    return {
        galleryDl: Boolean(galleryDl),
        ytDlp: Boolean(ytDlp),
        paths: {
            galleryDl: galleryDl || '',
            ytDlp: ytDlp || ''
        }
    }
})

ipcMain.handle('download-batch-start', async (_event, payload) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {}
    return await startDownloadBatch({
        links: Array.isArray(safePayload.links) ? safePayload.links : [],
        browser: typeof safePayload.browser === 'string' ? safePayload.browser : '',
        saveMode: safePayload.saveMode === 'misturado' ? 'misturado' : 'perfil',
        concurrency: safePayload.concurrency,
        retries: safePayload.retries,
        timeoutMs: safePayload.timeoutMs,
        openFolderOnFinish: Boolean(safePayload.openFolderOnFinish)
    })
})

ipcMain.handle('download-batch-cancel', async (_event, batchId) => {
    return cancelDownloadBatch(String(batchId || ''))
})

ipcMain.handle('open-download-folder', async () => {
    try {
        const openResult = await openFolderBestEffort(DOWNLOAD_DIR)
        return {
            ok: Boolean(openResult?.ok),
            path: DOWNLOAD_DIR,
            details: openResult
        }
    } catch (error) {
        return { ok: false, error: error?.message || String(error), path: DOWNLOAD_DIR }
    }
})

ipcMain.handle('get-download-folder', async () => {
    return { ok: true, path: DOWNLOAD_DIR }
})
