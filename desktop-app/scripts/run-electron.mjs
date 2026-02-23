import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const rawArgs = process.argv.slice(2)
const defaultFlags = ['--disable-gpu', '--disable-gpu-sandbox']
const args = [
  ...defaultFlags.filter((flag) => !rawArgs.includes(flag)),
  ...rawArgs
]
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, args, { stdio: 'inherit', env })

child.on('exit', (code, signal) => {
  if (typeof code === 'number') process.exit(code)
  process.exit(signal ? 1 : 0)
})

child.on('error', (error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
