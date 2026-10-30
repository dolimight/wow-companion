import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import WebSocket from 'ws'

type DebuggerLocation = { scriptId: string; lineNumber: number; columnNumber?: number }
type DebuggerFrame = { callFrameId: string; functionName?: string; url?: string; location?: DebuggerLocation }
type ExceptionDetails = { exception?: { description?: string }; text?: string }
type ProtocolMessage = {
  id?: number
  error?: unknown
  result?: unknown
  method?: string
  params?: {
    exceptionDetails?: ExceptionDetails
    reason?: string
    data?: { description?: string }
    callFrames?: DebuggerFrame[]
  }
}
type MainProbe = { pid: number; electron: string; node: string; processType: string }
type EvaluationResult = { result?: { value?: MainProbe } }
type Evidence = {
  startedAt: string
  executable: string
  main: {
    attached: boolean
    pauses: Array<{ reason?: string; functionName?: string; url?: string; location?: DebuggerLocation }>
    exceptions: string[]
    probe: MainProbe | null
  }
  passed: boolean
  finishedAt?: string
  exitCode?: number | null
  protocolFailure?: string
}
type PendingCommand = { resolve(result: unknown): void; reject(error: Error): void }

const electron: unknown = createRequire(import.meta.url)('electron')
if (typeof electron !== 'string') throw new Error('Electron executable path is unavailable')

// Explicit opt-in, fresh test profile, loopback-only inspector, never a production default
const dataDirectory = resolve(process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR ?? `.local/debug-acceptance-${Date.now()}`)
await mkdir(dataDirectory, { recursive: true })
const packagedExecutable = process.env.WOW_COMPANION_DEBUG_EXECUTABLE
const executable = packagedExecutable ? resolve(packagedExecutable) : electron
const args = ['--inspect-brk=127.0.0.1:0', ...(packagedExecutable ? [] : ['.']), '--acceptance']
const env: NodeJS.ProcessEnv = { ...process.env, WOW_COMPANION_HEADLESS: '1', WOW_COMPANION_DEBUG_ACCEPTANCE: '1', WOW_COMPANION_DATA_DIR: dataDirectory }
delete env.ELECTRON_RUN_AS_NODE
const evidence: Evidence = { startedAt: new Date().toISOString(), executable, main: { attached: false, pauses: [], exceptions: [], probe: null }, passed: false }
console.log(`Debugger acceptance workspace: ${dataDirectory}`)
const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let socket: WebSocket | undefined
let nextId = 0
const pending = new Map<number, PendingCommand>()
let attaching = false
let protocolFailure: string | undefined
let stderr = ''
let stdout = ''
const command = <Result = unknown>(method: string, params: Record<string, unknown> = {}): Promise<Result> => new Promise((resolveResult, reject) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('Debugger socket is not connected')); return }
  const id = ++nextId
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger command timed out: ${method}`)) }, 15_000)
  pending.set(id, { resolve: (result) => { clearTimeout(timeout); resolveResult(result as Result) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
  socket.send(JSON.stringify({ id, method, params }))
})
async function attach(url: string) {
  if (attaching) return
  attaching = true
  const inspector = new WebSocket(url)
  socket = inspector
  inspector.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString()) as ProtocolMessage
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') evidence.main.exceptions.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? 'Uncaught main-process exception')
    if (message.method === 'Debugger.paused') {
      const params = message.params
      if (!params) return
      const frame = params.callFrames?.[0]
      evidence.main.pauses.push({ reason: params.reason, functionName: frame?.functionName, url: frame?.url, location: frame?.location })
      console.log(`Main debugger paused: ${params.reason} (${frame?.functionName ?? 'startup'})`)
      if (params.reason === 'exception') evidence.main.exceptions.push(params.data?.description ?? 'Uncaught main-process exception')
      void (async () => {
        if (frame && !evidence.main.probe) {
          const result = await command<EvaluationResult>('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: '({pid:process.pid,electron:process.versions.electron,node:process.versions.node,processType:process.type})', returnByValue: true })
          evidence.main.probe = result.result?.value ?? null
        }
        await command('Debugger.resume')
      })().catch(fail)
    }
  })
  await new Promise<void>((resolveOpen, reject) => { inspector.once('open', resolveOpen); inspector.once('error', reject) })
  evidence.main.attached = true
  await command('Runtime.enable')
  await command('Debugger.enable')
  await command('Debugger.setPauseOnExceptions', { state: 'uncaught' })
  await command('Runtime.runIfWaitingForDebugger')
  console.log('Main-process debugger attached, exception monitoring enabled')
}
function fail(error: unknown) {
  protocolFailure = error instanceof Error ? error.message : String(error)
  console.error(protocolFailure)
  socket?.close()
  child.kill()
}
child.stdout.on('data', (chunk) => { const value = chunk.toString(); stdout += value; process.stdout.write(value) })
child.stderr.on('data', (chunk) => {
  const value = chunk.toString()
  stderr += value
  process.stderr.write(value)
  const match = stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)
  if (match && !attaching) void attach(match[1]).catch(fail)
  // Electron waits for Node inspector clients at shutdown; detach after the report is committed
  if (stderr.includes('Waiting for the debugger to disconnect')) socket?.close()
})
child.on('error', fail)
const deadline = setTimeout(() => fail(new Error('Debugger desktop acceptance exceeded 180 seconds')), 180_000)
const code = await new Promise<number | null>((resolveExit) => child.once('exit', (exitCode) => resolveExit(exitCode)))
clearTimeout(deadline)
socket?.close()
for (const request of pending.values()) request.reject(new Error('Application exited'))
evidence.finishedAt = new Date().toISOString()
evidence.exitCode = code
if (protocolFailure) evidence.protocolFailure = protocolFailure
evidence.passed = code === 0 && evidence.main.attached && evidence.main.pauses.length > 0 && evidence.main.probe?.processType === 'browser' && evidence.main.exceptions.length === 0 && !protocolFailure && stdout.includes('"passed":true')
await Promise.all([
  writeFile(join(dataDirectory, 'debugger.json'), JSON.stringify(evidence, null, 2)),
  writeFile(join(dataDirectory, 'stdout.log'), stdout),
  writeFile(join(dataDirectory, 'stderr.log'), stderr),
])
console.log(JSON.stringify({ debuggerPassed: evidence.passed, mainPauses: evidence.main.pauses.length, mainExceptions: evidence.main.exceptions.length, evidence: join(dataDirectory, 'debugger.json') }))
process.exitCode = evidence.passed ? 0 : 1
