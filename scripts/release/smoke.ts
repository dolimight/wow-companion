import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { access } from 'node:fs/promises'
const arch = process.argv[2]
if (!arch || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid architecture')
if (process.platform !== 'win32') throw new Error('Packaged release smoke runs on Windows')
const executable = resolve('release/win-unpacked/WOW Companion.exe')
await access(executable)

/** One full acceptance run against the packaged app, in its own fresh data folder */
function run(attempt: number): Promise<number> {
  const env = { ...process.env, WOW_COMPANION_DEBUG_EXECUTABLE: executable, WOW_COMPANION_ACCEPTANCE_DATA_DIR: resolve(`.local/packaged-release-${arch}-${Date.now()}-${attempt}`) }
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), 'scripts/debug-desktop.ts'], { stdio: 'inherit', env, windowsHide: true })
  return new Promise(done => {
    child.on('error', error => { console.error(error.message); done(1) })
    child.on('exit', code => done(code ?? 1))
  })
}

// Hosted Windows runners stall now and then, so a failed run gets one fresh retry. A real regression fails both times,
// and a pass on the retry is logged as a warning so flaky steps stay visible
let code = await run(1)
if (code !== 0) {
  console.log('::warning title=Packaged smoke retried::The first acceptance run failed; retrying once with a fresh data folder')
  code = await run(2)
  if (code === 0) console.log('::warning title=Packaged smoke flaked::Acceptance passed on the retry; check the first run above for the step that timed out')
}
process.exitCode = code
