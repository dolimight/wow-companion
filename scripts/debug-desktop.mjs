import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import electron from 'electron'
import WebSocket from 'ws'

// Explicit opt-in, fresh test profile, loopback-only inspector, never a production default
const dataDirectory = resolve(process.env.WOW_COMPANION_ACCEPTANCE_DATA_DIR ?? `.local/debug-acceptance-${Date.now()}`)
await mkdir(dataDirectory, { recursive: true })
const packagedExecutable = process.env.WOW_COMPANION_DEBUG_EXECUTABLE
const executable = packagedExecutable ? resolve(packagedExecutable) : electron
const args = ['--inspect-brk=127.0.0.1:0', ...(packagedExecutable ? [] : ['.']), '--acceptance']
const env = { ...process.env, WOW_COMPANION_HEADLESS: '1', WOW_COMPANION_DEBUG_ACCEPTANCE: '1', WOW_COMPANION_DATA_DIR: dataDirectory }
delete env.ELECTRON_RUN_AS_NODE
const evidence = { startedAt: new Date().toISOString(), executable, main: { attached: false, pauses: [], exceptions: [], probe: null }, passed: false }
console.log(`Debugger acceptance workspace: ${dataDirectory}`)
const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let socket
let nextId = 0
const pending = new Map()
let attaching = false
let protocolFailure
let stderr = ''
let stdout = ''
const command = (method, params = {}) => new Promise((resolveResult, reject) => {
  const id = ++nextId
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger command timed out: ${method}`)) }, 15_000)
  pending.set(id, { resolve: (result) => { clearTimeout(timeout); resolveResult(result) }, reject: (error) => { clearTimeout(timeout); reject(error) } })
  socket.send(JSON.stringify({ id, method, params }))
})
async function attach(url) {
  if (attaching) return
  attaching = true
  socket = new WebSocket(url)
  socket.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString())
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') evidence.main.exceptions.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text)
    if (message.method === 'Debugger.paused') {
      const params = message.params
      const frame = params.callFrames?.[0]
      evidence.main.pauses.push({ reason: params.reason, functionName: frame?.functionName, url: frame?.url, location: frame?.location })
      console.log(`Main debugger paused: ${params.reason} (${frame?.functionName ?? 'startup'})`)
      if (params.reason === 'exception') evidence.main.exceptions.push(params.data?.description ?? 'Uncaught main-process exception')
      void (async () => {
        if (frame && !evidence.main.probe) {
          const result = await command('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: '({pid:process.pid,electron:process.versions.electron,node:process.versions.node,processType:process.type})', returnByValue: true })
          evidence.main.probe = result.result?.value ?? null
        }
        await command('Debugger.resume')
      })().catch(fail)
    }
  })
  await new Promise((resolveOpen, reject) => { socket.once('open', resolveOpen); socket.once('error', reject) })
  evidence.main.attached = true
  await command('Runtime.enable')
  await command('Debugger.enable')
  await command('Debugger.setPauseOnExceptions', { state: 'uncaught' })
  await command('Runtime.runIfWaitingForDebugger')
  console.log('Main-process debugger attached, exception monitoring enabled')
}
function fail(error) {
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
const code = await new Promise((resolveExit) => child.once('exit', (exitCode) => resolveExit(exitCode)))
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
