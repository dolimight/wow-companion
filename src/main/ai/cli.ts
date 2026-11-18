import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

/** Each name a command may have on this platform; Windows installs .exe builds and npm installs .cmd shims */
const candidates = (name: string, platform = process.platform) => platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name]

/** The first match for a command on PATH or in the folders its installer uses, or null */
export async function findExecutable(name: string, extraDirs: string[] = [], env = process.env, platform = process.platform): Promise<string | null> {
  const dirs = [...(env.PATH ?? env.Path ?? '').split(path.delimiter), ...extraDirs].filter(Boolean)
  for (const dir of dirs) for (const file of candidates(name, platform)) {
    const full = path.join(dir, file)
    try { await access(full); return full } catch { /* keep looking */ }
  }
  return null
}

export type Launcher = { command: string; prefix: string[]; env?: NodeJS.ProcessEnv }

/**
 * How to start an executable without a shell. An npm .cmd shim can't run without one, so its JavaScript entry point
 * runs in this app's own Node runtime instead, keeping every argument out of a command line
 */
export async function launcherFor(file: string, nodeRuntime = process.execPath): Promise<Launcher> {
  if (!/\.cmd$/i.test(file)) return { command: file, prefix: [] }
  const shim = await readFile(file, 'utf8')
  // npm's shims name the script as "%dp0%\node_modules\…\cli.js" (or %~dp0 in older ones)
  const script = shim.match(/"%~?dp0%?\\([^"%]+\.js)"/i)?.[1]
  if (!script) throw new Error(`${path.basename(file)} isn't a launcher the app can run; install the standalone build instead`)
  return { command: nodeRuntime, prefix: [path.join(path.dirname(file), script)], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

export type CliResult = { stdout: string; stderr: string; code: number | null }

/** Runs a command with no shell, the input on stdin, a time limit, and a cap on what it may print */
export function runCli(launcher: Launcher, args: string[], options: { input?: string; cwd?: string; timeoutMs?: number; signal?: AbortSignal; maxBytes?: number } = {}): Promise<CliResult> {
  const { input, cwd, timeoutMs = 120_000, signal, maxBytes = 4 * 1024 * 1024 } = options
  return new Promise((resolve, reject) => {
    const child = spawn(launcher.command, [...launcher.prefix, ...args], { cwd, shell: false, windowsHide: true, env: { ...process.env, ...launcher.env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', size = 0, settled = false
    const finish = (error: Error | null, result?: CliResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error) { child.kill(); reject(error) } else resolve(result!)
    }
    const timer = setTimeout(() => finish(new Error(`No answer after ${Math.ceil(timeoutMs / 1000)} s`)), timeoutMs)
    const abort = () => finish(new Error('Stopped'))
    signal?.addEventListener('abort', abort, { once: true })
    const take = (chunk: Buffer, into: 'out' | 'err') => {
      size += chunk.byteLength
      if (size > maxBytes) return finish(new Error('The assistant printed more than the app reads'))
      if (into === 'out') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8')
    }
    child.stdout.on('data', chunk => take(chunk, 'out'))
    child.stderr.on('data', chunk => take(chunk, 'err'))
    child.on('error', error => finish(error))
    child.on('close', code => finish(null, { stdout, stderr, code }))
    child.stdin.on('error', () => { /* the command may exit before reading its input */ })
    child.stdin.end(input ?? '')
  })
}

/** The last useful line of a failed command, for an error the player can act on */
export function failureLine(result: CliResult) {
  const lines = `${result.stderr}\n${result.stdout}`.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.at(-1)?.slice(0, 300) ?? `exited with code ${result.code}`
}
