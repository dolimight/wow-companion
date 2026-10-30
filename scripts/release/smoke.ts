import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { access } from 'node:fs/promises'
const arch = process.argv[2]
if (!arch || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid architecture')
if (process.platform !== 'win32') throw new Error('Packaged release smoke runs on Windows')
const executable = resolve('release/win-unpacked/WOW Companion.exe')
await access(executable)
const env = { ...process.env, WOW_COMPANION_DEBUG_EXECUTABLE: executable, WOW_COMPANION_ACCEPTANCE_DATA_DIR: resolve(`.local/packaged-release-${arch}-${Date.now()}`) }
const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), 'scripts/debug-desktop.ts'], { stdio: 'inherit', env, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
