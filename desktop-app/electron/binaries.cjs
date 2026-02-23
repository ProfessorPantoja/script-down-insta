const fs = require('fs/promises')
const path = require('path')

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function pathEntries() {
  const envPath = process.env.PATH || ''
  const sep = process.platform === 'win32' ? ';' : ':'
  return envPath.split(sep).filter(Boolean)
}

function candidateNames(baseName) {
  if (process.platform !== 'win32') return [baseName]
  const pathext = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .filter(Boolean)
  const hasExt = /\.[a-z0-9]+$/i.test(baseName)
  if (hasExt) return [baseName]
  return pathext.map((ext) => `${baseName}${ext.toLowerCase()}`)
}

async function findOnPath(baseName) {
  for (const dir of pathEntries()) {
    for (const name of candidateNames(baseName)) {
      const candidate = path.join(dir, name)
      if (await fileExists(candidate)) return candidate
    }
  }
  return null
}

async function findInResources(baseName) {
  const resourcesPath = process.resourcesPath
  if (!resourcesPath) return null

  const platformDir =
    process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'

  const candidates = []
  for (const name of candidateNames(baseName)) {
    candidates.push(path.join(resourcesPath, 'bin', platformDir, name))
    candidates.push(path.join(resourcesPath, 'bin', name))
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}

async function resolveBinary(baseName, envVarName) {
  const envValue = process.env[envVarName]
  if (envValue && (await fileExists(envValue))) return envValue

  const fromResources = await findInResources(baseName)
  if (fromResources) return fromResources

  return await findOnPath(baseName)
}

module.exports = {
  resolveBinary
}

