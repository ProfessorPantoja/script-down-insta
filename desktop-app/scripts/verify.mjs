import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const isFast = args.has('--fast')

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} saiu com código ${code}`))
    })
    child.on('error', reject)
  })
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(`== verify (${isFast ? 'fast' : 'full'}) ==`)

  await run('npm', ['run', 'build'])

  if (!isFast) {
    await run('npm', ['run', 'prepare:win-bins'])
    await run('npm', ['run', 'pack'])

    const expected = path.resolve('release/linux-unpacked/resources/bin/win')
    const yt = path.join(expected, 'yt-dlp.exe')
    const gd = path.join(expected, 'gallery-dl.exe')

    if (!(await pathExists(yt)) || !(await pathExists(gd))) {
      throw new Error(
        `Binários não encontrados dentro do app empacotado.\n` +
          `Esperado: ${expected}\n` +
          `Achou yt-dlp.exe: ${await pathExists(yt)}\n` +
          `Achou gallery-dl.exe: ${await pathExists(gd)}`
      )
    }
  }

  console.log('OK')
}

main().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})

