const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs/promises')

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

function runCommand(command, args) {
    return new Promise((resolve) => {
        const proc = spawn(command, args)
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        proc.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        proc.on('close', (code) => {
            resolve({
                ok: code === 0,
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            })
        })

        proc.on('error', (error) => {
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

async function probeMedia(url, browser) {
    const args = ['--skip-download', '--dump-single-json', '--no-warnings']
    if (browser) {
        args.push('--cookies-from-browser', browser)
    }
    args.push(url)

    const probe = await runCommand('yt-dlp', args)
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

async function downloadMedia({ url, browser, saveMode }) {
    const outputDir = path.join(app.getPath('downloads'), 'InstaBatch')
    const normalizedUrl = normalizeUrl(url)
    const platform = detectPlatform(normalizedUrl)

    if (platform === 'kwai') {
        const args = ['--no-warnings', '--no-progress', '--output-na-placeholder', 'na']
        if (browser) {
            args.push('--cookies-from-browser', browser)
        }
        args.push('-P', outputDir)

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
        const result = await runCommand('yt-dlp', args)
        return {
            success: result.ok,
            url: normalizedUrl,
            platform,
            tool: 'yt-dlp',
            error: result.ok ? undefined : (result.stderr || `Process exited with code ${result.code}`)
        }
    }

    const args = []
    if (browser) {
        args.push('--cookies-from-browser', browser)
    }
    args.push('-d', outputDir, normalizedUrl)

    const result = await runCommand('gallery-dl', args)
    return {
        success: result.ok,
        url: normalizedUrl,
        platform,
        tool: 'gallery-dl',
        error: result.ok ? undefined : (result.stderr || `Process exited with code ${result.code}`)
    }
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
