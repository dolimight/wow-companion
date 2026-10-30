import { Worker } from 'node:worker_threads'
import type { GameDataEngine } from './engine'
import type { GameDataStatus } from '../../shared/gamedata'

type Method = 'getStatus' | 'configure' | 'ensureIndex' | 'search' | 'item' | 'items' | 'enhancements' | 'appearanceOptions' | 'enchantNames' | 'icon' | 'close'
type Args<K extends Method> = Parameters<GameDataEngine[K]>
type Result<K extends Method> = K extends 'configure' ? GameDataStatus : Awaited<ReturnType<GameDataEngine[K]>>

/** Mirrors DatabaseClient: one worker owns the install reader and item index */
export class GameDataClient {
  private worker: Worker
  private sequence = 0
  private closed = false
  private status: GameDataStatus = { state: 'no-install', install: null, indexedVersion: null, itemCount: 0, progress: null, error: null }
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(directory: string, private readonly onStatus: (status: GameDataStatus) => void, workerUrl = new URL('./gamedata-worker.js', import.meta.url)) {
    const execArgv = process.execArgv.filter(argument => !/^--inspect(?:-brk|-port|-wait)?(?:=|$)/.test(argument))
    this.worker = new Worker(workerUrl, { workerData: { directory }, execArgv })
    this.worker.on('message', (message: { id?: number; event?: string; status?: GameDataStatus; value?: unknown; error?: string }) => {
      if (message.event === 'status' && message.status) { this.status = message.status; this.onStatus(message.status); return }
      const entry = message.id === undefined ? undefined : this.pending.get(message.id)
      if (!entry) return
      clearTimeout(entry.timer); this.pending.delete(message.id!)
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.value)
    })
    this.worker.on('error', error => this.fail(error))
    this.worker.on('exit', code => { if (!this.closed) this.fail(new Error(`The game data worker stopped (${code})`)) })
  }
  get currentStatus() { return this.status }
  private fail(error: Error) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error) } this.pending.clear() }
  call<K extends Method>(method: K, ...args: Args<K>): Promise<Result<K>> {
    if (this.closed) return Promise.reject(new Error('Game data is closed'))
    // Building the index can take a while on slow disks; queries are fast
    const timeout = method === 'ensureIndex' || method === 'configure' ? 10 * 60_000 : 60_000
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Game data did not respond in time')) }, timeout)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.worker.postMessage({ id, method, args })
    })
  }
  async close() { if (this.closed) return; try { await this.call('close') } catch { /* closing */ } finally { this.closed = true; this.fail(new Error('Application is closing')); await this.worker.terminate() } }
}
