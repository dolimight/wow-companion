import { parentPort, workerData } from 'node:worker_threads'
import { GameDataEngine } from '../../main/gamedata/engine'

/** Game files are parsed off the main thread; this worker is the only reader of the install and item index */
const engine = new GameDataEngine(workerData.directory, { status: status => parentPort!.postMessage({ event: 'status', status }) })
const allowed = new Set(['getStatus', 'configure', 'ensureIndex', 'search', 'item', 'items', 'enhancements', 'appearanceOptions', 'enchantNames', 'icon', 'close'])
parentPort!.on('message', async (message: { id: number; method: string; args: unknown[] }) => {
  try {
    if (!allowed.has(message.method)) throw new Error('Unknown game data operation')
    const operation = (engine as unknown as Record<string, (...args: unknown[]) => unknown>)[message.method]!
    const value = await operation.apply(engine, message.args)
    // Install details stay inside the worker; only the public status leaves it
    parentPort!.postMessage({ id: message.id, value: message.method === 'configure' ? engine.getStatus() : value })
  } catch (error) {
    parentPort!.postMessage({ id: message.id, error: error instanceof Error ? error.message : 'Game data operation failed' })
  }
})
