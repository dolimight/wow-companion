import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { WebSocketServer } from 'ws'
import { applyWSSHandler } from '@trpc/server/adapters/ws'
import { Effect } from 'effect'
import { createRouter, type SyncStatus } from './rpc/router'
import type { DatabaseClient } from './database'
import { parseSnapshot } from './imports/parse-snapshot'
import { watchRoster, type SnapshotWatch } from './imports/watch-roster'
import { GameDataClient } from './gamedata/client'
import { createConnections } from './connections/service'
import { createInsights } from './insights'
import { createSync } from './sync'
import path from 'node:path'
import { createProgressionService } from './progression/service'
import { ProgressionEvaluator } from './progression/evaluator'
import { createSessionService } from './session/service'
import { createSimulationService } from './simulation/service'
import { createComparisonService } from './comparisons/service'
import {createModelCache} from './models/cache'
import type { SecretStore } from './secrets'

export function matchesToken(actual:unknown,expected:string){if(typeof actual!=='string')return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export async function startLocalService(options:{db:DatabaseClient;origins:string[];refreshCharacter:(id:string)=>Promise<import('../shared/domain').Character>;gameDataDir:string;gameDataWorker?:URL;progressionWorker?:URL;secrets:SecretStore;addonDir:string;assetsDir:string;autoSync?:boolean}){
  const {db}=options;const events=new EventEmitter();const token=randomBytes(32).toString('hex')
  let status:SyncStatus={lastCheckAt:null,path:null,error:null},watcher:SnapshotWatch|undefined
  async function changed(characterId?:string){const revision=await db.call('getRevision');events.emit('changed',{revision,characterId})}
  async function commit(snapshot:unknown){const report=await db.call('importSnapshot',snapshot);if(report.imported.length)await changed();return report}
  async function importText(text:string){return Effect.runPromise(Effect.tryPromise({try:()=>commit(parseSnapshot(text)),catch:e=>e instanceof Error?e:new Error('Import failed')}))}
  async function setWatchPath(path:string|null){watcher?.close();watcher=undefined;status={...status,path,error:null};await db.call('setSettings',{addonPath:path});if(path){watcher=watchRoster(path,commit,info=>{status={...status,lastCheckAt:info.checkedAt,error:info.error};events.emit('changed',{revision:0})})}}
  const gameData=new GameDataClient(options.gameDataDir,()=>events.emit('changed',{revision:0}),options.gameDataWorker)
  const connections=createConnections({db,gameData,secrets:options.secrets,addonDir:options.addonDir,assetsDir:options.assetsDir,changed,setWatchPath,watchedPath:()=>status.path})
  /** Blizzard and Raider.IO refresh independently; either one succeeding is enough */
  async function refreshCharacter(id:string){
    const errors:unknown[]=[];let result:import('../shared/domain').Character|undefined
    if(await connections.blizzardConfigured()){try{result=await connections.refreshCharacter(id)}catch(error){errors.push(error)}}
    try{result=await options.refreshCharacter(id)}catch(error){errors.push(error)}
    if(!result)throw errors[0] instanceof Error?errors[0]:new Error('Character refresh failed')
    return result
  }
  const insights=createInsights({cacheDir:path.join(options.assetsDir,'cache'),blizzardApi:()=>connections.blizzardApi(),gameData})
  const evaluator=new ProgressionEvaluator(options.progressionWorker)
  const progression=createProgressionService({db,items:ids=>gameData.call('items',ids),installedBuild:()=>gameData.currentStatus.install?.version??null,metadataBuild:()=>gameData.currentStatus.indexedVersion,evaluator:input=>evaluator.evaluate(input)})
  const session=createSessionService({db,progression})
  const simulations=createSimulationService({db,artifactDir:path.join(options.assetsDir,'simulations'),onChanged:()=>changed()})
  const models=createModelCache({db,rootDir:path.join(options.assetsDir,'models')})
  const comparisons=createComparisonService({db,insights,blizzardApi:()=>connections.blizzardApi(),secrets:options.secrets})
  const sync=createSync({db,refreshCharacter,discover:()=>connections.discover(!!options.autoSync),checkAddonFile:async()=>{await watcher?.check()},addonFile:()=>status,changed:()=>changed()})
  const router=createRouter({db,events,changed,importText,syncStatus:()=>status,refreshCharacter,gameData,connections,insights,sync,progression,session,simulations,comparisons,models})
  const server=createServer((_req,res)=>{res.writeHead(404,{'X-Content-Type-Options':'nosniff'});res.end()})
  const wss=new WebSocketServer({server,maxPayload:17*1024*1024,verifyClient:({origin},done)=>done(options.origins.includes(origin),403,'Untrusted origin')})
  const handler=applyWSSHandler({wss,router,createContext:async({info})=>({authorized:matchesToken(info.connectionParams?.token,token)}),keepAlive:{enabled:true,pingMs:30000,pongWaitMs:5000}})
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve())})
  const address=server.address();if(!address||typeof address==='string')throw new Error('Could not start the local service')
  const settings=await db.call('getSettings');if(settings.addonPath)await setWatchPath(settings.addonPath)
  // Every launch brings the roster up to date without anyone choosing a file
  void connections.initialize().then(()=>{if(options.autoSync)void sync.run('startup')})
  let closed=false
  return {connection:{url:'ws://127.0.0.1:'+address.port,token},router,changed,importText,setWatchPath,getSyncStatus:()=>status,gameData,connections,sync,simulations,session,models,async close(){if(closed)return;closed=true;watcher?.close();connections.cancelSignIn();await simulations.close();await evaluator.close();await gameData.close();handler.broadcastReconnectNotification();for(const ws of wss.clients)ws.terminate();await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));events.removeAllListeners()}}
}
