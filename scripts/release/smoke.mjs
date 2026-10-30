import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { access } from 'node:fs/promises'
const arch = process.argv[2]
if (!['x64', 'arm64'].includes(arch)) throw new Error('Invalid architecture')
const executable = process.platform === 'win32' ? resolve('release/win-unpacked/WOW Companion.exe') : resolve(`release/${arch === 'arm64' ? 'mac-arm64' : 'mac'}/WOW Companion.app/Contents/MacOS/WOW Companion`)
await access(executable)
const env = { ...process.env, WOW_COMPANION_DEBUG_EXECUTABLE: executable, WOW_COMPANION_ACCEPTANCE_DATA_DIR: resolve(`.local/packaged-release-${arch}-${Date.now()}`) }
const child = spawn(process.execPath, ['scripts/debug-desktop.mjs'], { stdio: 'inherit', env, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
