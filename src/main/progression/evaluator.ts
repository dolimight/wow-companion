import { Worker } from 'node:worker_threads'
import type { evaluateProgression, ProgressionResult } from '../../shared/progression-evaluation'

export type ProgressionInput = Parameters<typeof evaluateProgression>[0]

/** Legal-set searches run outside Electron's main thread, with a bounded lifetime */
export class ProgressionEvaluator {
  private worker: Worker | null = null
  private sequence = 0
  private closed = false
  private pending = new Map<number, { resolve: (result: ProgressionResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private readonly workerUrl = new URL('./progression-worker.js', import.meta.url)) {}

  private start() {
    if (this.worker) return this.worker
    const execArgv = process.execArgv.filter(argument => !/^--inspect(?:-brk|-port|-wait)?(?:=|$)/.test(argument))
    const worker = new Worker(this.workerUrl, { execArgv })
    this.worker = worker
    worker.on('message', (message: { id: number; value?: ProgressionResult; error?: string }) => {
      const request = this.pending.get(message.id)
      if (!request) return
      clearTimeout(request.timer); this.pending.delete(message.id)
      if (message.error || !message.value) request.reject(new Error(message.error ?? 'Progression returned no result'))
      else request.resolve(message.value)
    })
    worker.on('error', error => this.fail(worker, error))
    worker.on('exit', code => { if (this.worker === worker) this.fail(worker, new Error(`The progression worker stopped (${code})`)) })
    return worker
  }
  private fail(worker: Worker, error: Error) {
    if (this.worker !== worker) return
    this.worker = null
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
    this.pending.clear()
    void worker.terminate()
  }
  evaluate(input: ProgressionInput): Promise<ProgressionResult> {
    if (this.closed) return Promise.reject(new Error('Progression is closed'))
    return new Promise((resolve, reject) => {
      const worker = this.start(), id = ++this.sequence
      const timer = setTimeout(() => this.fail(worker, new Error('The progression search timed out — narrow the available candidates and try again')), 30_000)
      this.pending.set(id, { resolve, reject, timer })
      try { worker.postMessage({ id, input }) }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  async close() {
    this.closed = true
    const worker = this.worker
    if (!worker) return
    this.fail(worker, new Error('Application is closing'))
    await worker.terminate()
  }
}
