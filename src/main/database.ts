import { Worker } from 'node:worker_threads'
import type { DatabaseRepository } from '../workers/database/repository'

type Method = { [K in keyof DatabaseRepository]: DatabaseRepository[K] extends (...args: never[]) => unknown ? K : never }[keyof DatabaseRepository]
type Args<K extends Method> = DatabaseRepository[K] extends (...args: infer A) => unknown ? A : never
type Result<K extends Method> = DatabaseRepository[K] extends (...args: never[]) => infer R ? R : never

/** The worker owns the sole SQLite connection and serializes every transaction */
export class DatabaseClient {
  private worker: Worker
  private sequence = 0
  private closed = false
  private pending = new Map<number, {resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  constructor(path: string, workerUrl = new URL('./database-worker.js', import.meta.url)) {
    // A main-process startup breakpoint must not silently pause the database worker too
    const execArgv = process.execArgv.filter((argument) => !/^--inspect(?:-brk|-port|-wait)?(?:=|$)/.test(argument))
    this.worker = new Worker(workerUrl, { workerData: { path }, execArgv })
    this.worker.on('message', (message: { id:number; value?:unknown; error?:string }) => {
      const entry = this.pending.get(message.id)
      if (!entry) return
      clearTimeout(entry.timer); this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.value)
    })
    this.worker.on('error', error => this.fail(error))
    this.worker.on('exit', code => { if (!this.closed) this.fail(new Error('The local database worker stopped ('+code+')')) })
  }
  private fail(error: Error) { for (const p of this.pending.values()) {clearTimeout(p.timer);p.reject(error)}this.pending.clear() }
  call<K extends Method>(method:K,...args:Args<K>):Promise<Result<K>> {
    if(this.closed)return Promise.reject(new Error('The database is closed'))
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('The database did not respond in time'))},30000);this.pending.set(id,{resolve:resolve as (value:unknown)=>void,reject,timer});this.worker.postMessage({id,method,args})})
  }
  async close() { if(this.closed)return;try{await this.call('close')}finally{this.closed=true;this.fail(new Error('Application is closing'));await this.worker.terminate()} }
}
