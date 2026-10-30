import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseRepository } from './repository'

const repository = new DatabaseRepository(workerData.path)
const allowed = new Set(['getRevision','listCharacters','getCharacter','addCharacter','updateCharacter','archiveCharacter','deleteCharacter','restoreCharacter','getGearDraft','saveGearDraft','listOutfits','saveOutfit','deleteOutfit','getSettings','setSettings','getContentPreferences','setContentPreferences','importSnapshot','exportBackup','importBackup','seedDemo','applyProviderRatings','applyProviderProfile','applyBlizzardProfile','findCharacterByRef','close'])
parentPort!.on('message', (message: { id:number;method:string;args:unknown[] }) => {
  try {
    if(!allowed.has(message.method)&&!['getFeatureState','saveFeatureState'].includes(message.method))throw new Error('Unknown database operation')
    const operation = (repository as unknown as Record<string,(...args:unknown[])=>unknown>)[message.method]
    if(typeof operation!=='function')throw new Error('Database operation is unavailable')
    const value=operation.apply(repository,message.args)
    parentPort!.postMessage({id:message.id,value})
  } catch(error) { parentPort!.postMessage({id:message.id,error:error instanceof Error?error.message:'Database operation failed'}) }
})
