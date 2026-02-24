import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const YTDLP_VERSION = process.env.YTDLP_VERSION || '2026.02.21'
const GALLERY_DL_VERSION = process.env.GALLERY_DL_VERSION || 'v1.31.6'

const targets = [
  {
    name: 'yt-dlp.exe',
    url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`
  },
  {
    name: 'gallery-dl.exe',
    url: `https://github.com/mikf/gallery-dl/releases/download/${GALLERY_DL_VERSION}/gallery-dl.exe`
  }
]

const outDir = path.resolve(__dirname, '../resources/bin/win')

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function download(url, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true })

  return await new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'InstaBatch-binary-fetcher'
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume()
          download(response.headers.location, destPath).then(resolve, reject)
          return
        }

        if (response.statusCode !== 200) {
          response.resume()
          reject(new Error(`Download falhou (${response.statusCode}) para ${url}`))
          return
        }

        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', async () => {
          try {
            await fs.writeFile(destPath, Buffer.concat(chunks))
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      }
    )

    request.on('error', reject)
  })
}

for (const item of targets) {
  const destPath = path.join(outDir, item.name)
  if (await exists(destPath)) {
    console.log(`[ok] já existe: ${path.relative(process.cwd(), destPath)}`)
    continue
  }
  console.log(`[dl] ${item.name}`)
  await download(item.url, destPath)
  console.log(`[ok] baixado: ${path.relative(process.cwd(), destPath)}`)
}

