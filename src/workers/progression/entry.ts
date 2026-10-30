import { parentPort } from 'node:worker_threads'
import { evaluateProgression } from '../../shared/progression-evaluation'

parentPort!.on('message', (message: { id: number; input: Parameters<typeof evaluateProgression>[0] }) => {
  try { parentPort!.postMessage({ id: message.id, value: evaluateProgression(message.input) }) }
  catch (error) { parentPort!.postMessage({ id: message.id, error: error instanceof Error ? error.message : 'Progression evaluation failed' }) }
})
