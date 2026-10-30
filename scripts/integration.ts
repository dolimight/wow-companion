import { createTRPCClient,createWSClient,wsLink } from '@trpc/client'
import WebSocket from 'ws'
import { mkdir,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { DatabaseClient } from '../src/main/database'
import { startLocalService } from '../src/main/local-service'
import { MemorySecretStore } from '../src/main/secrets'
import type { AppRouter } from '../src/main/rpc/router'
import { ProgressionEvaluator } from '../src/main/progression/evaluator'
import { progressionInput } from '../fixtures/progression'

const directory=resolve('.local/integration-'+Date.now());await mkdir(directory,{recursive:true})
let db=new DatabaseClient(resolve(directory,'test.sqlite'),pathToFileURL(resolve('out/main/database-worker.js')))
const service=await startLocalService({db,origins:['app://companion'],refreshCharacter:async()=>{throw new Error('Offline integration fixture')},gameDataDir:resolve(directory,'gamedata'),gameDataWorker:pathToFileURL(resolve('out/main/gamedata-worker.js')),progressionWorker:pathToFileURL(resolve('out/main/progression-worker.js')),secrets:new MemorySecretStore(),addonDir:resolve('addon'),assetsDir:directory})
const sockets:ReturnType<typeof createWSClient>[]=[];const results:string[]=[]
function client(token:string){class OwnedSocket extends WebSocket{constructor(url:string,protocols?:string|string[]){super(url,protocols,{origin:'app://companion'})}}const socket=createWSClient({url:service.connection.url,connectionParams:{token},WebSocket:OwnedSocket as unknown as typeof globalThis.WebSocket,retryDelayMs:()=>60000});sockets.push(socket);return createTRPCClient<AppRouter>({links:[wsLink({client:socket})]})}
try{
 const api=client(service.connection.token)
 assert.equal((await api.listCharacters.query()).length,0);results.push('Fresh database starts empty')
 await api.saveSettings.mutate({theme:'dark',sidebarWidth:300,reducedMotion:true});await api.saveSettings.mutate({activity:'pvp'});const preferences=await api.getSettings.query();assert.equal(preferences.theme,'dark');assert.equal(preferences.sidebarWidth,300);assert.equal(preferences.reducedMotion,true);assert.equal(preferences.activity,'pvp');results.push('Single-preference RPC update preserves the other saved settings')
 const unauth=client('wrong-token');await assert.rejects(()=>unauth.listCharacters.query(),/authorized/i);results.push('Wrong launch token rejected')
 const status=await new Promise<number>((done,reject)=>{const ws=new WebSocket(service.connection.url,{origin:'https://untrusted.example'});ws.once('unexpected-response',(_req,response)=>{response.resume();done(response.statusCode??0);ws.terminate()});ws.once('open',()=>{ws.close();reject(new Error('Unexpected origin accepted'))});ws.on('error',()=>{})});assert.equal(status,403);results.push('Untrusted WebSocket origin rejected')
 const a=await api.addCharacter.mutate({name:'Integration',realm:'Realm A',region:'eu'})
 const b=await api.addCharacter.mutate({name:'Integration',realm:'Realm B',region:'eu'});assert.notEqual(a.id,b.id);results.push('Same names on different realms remain separate')
 const content={activities:['mythicPlus'] as const,difficulties:['mythic'],allowCrafting:false,excludedMethods:['vault']}
 await api.saveContentPreferences.mutate({characterId:a.id,activity:'mythicPlus',preferences:{...content,activities:[...content.activities]}})
 assert.equal((await api.getContentPreferences.query({characterId:a.id,activity:'mythicPlus'})).allowCrafting,false)
 assert.equal((await api.getContentPreferences.query({characterId:a.id,activity:'raiding'})).allowCrafting,true)
 assert.equal((await api.getContentPreferences.query({characterId:b.id,activity:'mythicPlus'})).allowCrafting,true)
 const progression=await api.getProgression.query({characterId:a.id,activity:'mythicPlus'})
 assert.equal(progression.legalMaximum.itemLevel,null);assert.equal(progression.legalMaximum.status,'unsupported');assert.equal(progression.preferences.allowCrafting,false)
 results.push('Progression RPC evaluates in a worker and isolates content preferences by character and activity')
 const evaluator=new ProgressionEvaluator(pathToFileURL(resolve('out/main/progression-worker.js')))
 try { const input=progressionInput();const evaluated=await evaluator.evaluate(input);assert.equal(evaluated.equipped.itemLevel,100);assert.equal(evaluated.affordable.itemLevel,100);assert.equal(evaluated.legalMaximum.status,'supported') } finally { await evaluator.close() }
 await assert.rejects(()=>evaluator.evaluate(progressionInput()),/closed/);results.push('Compiled progression worker evaluates validated legal sets and closes cleanly')
 const draft={id:crypto.randomUUID(),characterId:a.id,specId:null,activity:'mythicPlus' as const,rulesetId:'unknown',name:'Persisted integration plan',items:[],updatedAt:new Date().toISOString()}
 await api.saveGearDraft.mutate(draft);assert.equal(await api.getGearDraft.query({characterId:b.id,specId:null,activity:'mythicPlus'}),null);results.push('Gear drafts stay isolated')
 await api.saveSessionPreferences.mutate({characterId:a.id,preferences:{goal:'weekly',budgetMinutes:20,characterIds:[a.id],activities:['mythicPlus']}})
 assert.equal((await api.sessionWorkspace.query({characterId:a.id})).state.preferences.budgetMinutes,20)
 assert.equal((await api.sessionWorkspace.query({characterId:b.id})).state.preferences.budgetMinutes,60)
 await api.setSessionDisposition.mutate({characterId:a.id,key:'fixture-action',kind:'pin',until:null})
 assert.equal((await api.sessionWorkspace.query({characterId:a.id})).state.dispositions[0]?.kind,'pin')
 await api.undoSessionDisposition.mutate({characterId:a.id,key:'fixture-action'})
 results.push('Tonight state persists over authenticated WebSockets with character isolation and undo')
 await api.saveSimulationReport.mutate({characterId:a.id,url:'https://www.raidbots.com/simbot/report/IntegrationFixture',notes:'Bookmarked report, no simulated result'})
 assert.equal((await api.simulationWorkspace.query({characterId:a.id})).reports.length,1)
 assert.equal((await api.simulationWorkspace.query({characterId:b.id})).reports.length,0)
 await assert.rejects(()=>api.importSimulationProfile.mutate({characterId:a.id,text:'mage=bad\ninput=outside.simc\n'}),/Unsupported/)
 results.push('Simulation bookmarks stay isolated and unsafe profile directives are rejected')
 await api.saveComparisonReport.mutate({characterId:a.id,url:'https://www.warcraftlogs.com/reports/AbCdEfGhIjKlMnOp',notes:'Public report reference'})
 assert.equal((await api.comparisonReports.query({characterId:a.id})).length,1)
 assert.equal((await api.comparisonReports.query({characterId:b.id})).length,0)
 assert.equal(await api.getModel.query({characterId:a.id}),null)
 results.push('Comparison references and local model handles remain character scoped')
 let notificationSawCommittedState=false;const subscription=api.changes.subscribe(undefined,{onData:async()=>{const list=await api.listCharacters.query();if(list.some(c=>c.id===a.id&&c.favorite))notificationSawCommittedState=true}})
 await new Promise(r=>setTimeout(r,100));await api.updateCharacter.mutate({id:a.id,patch:{favorite:true}})
 for(let i=0;i<30&&!notificationSawCommittedState;i++)await new Promise(r=>setTimeout(r,20))
 assert.ok(notificationSawCommittedState);subscription.unsubscribe();results.push('Subscription observes committed database state')
 const timestamp=new Date().toISOString();const record={guid:'Player-Integration-1',region:'eu',realm:'Realm A',name:'Imported',className:'Mage',raceName:'Night Elf',specName:'Frost',specId:64,level:90,observedAt:timestamp,sessionId:'integration-session',sequence:1,itemLevel:null,gear:[]}
 const envelope={schemaVersion:1,addonVersion:'test',sourceProfileId:'integration',exportedAt:timestamp,characters:{[record.guid]:record,bad:{guid:'bad'}}}
 const report=await api.importText.mutate({text:JSON.stringify(envelope)});assert.equal(report.imported.length,1);assert.equal(report.errors.length,1);const same=await api.importText.mutate({text:JSON.stringify(envelope)});assert.equal(same.unchanged.length,1);results.push('Valid sibling import commits and repeated export deduplicates')
 await api.archiveCharacter.mutate({id:a.id,archived:true});assert.equal((await api.listCharacters.query()).find(c=>c.id===a.id)?.archived,true);await api.archiveCharacter.mutate({id:a.id,archived:false});results.push('Archiving is reversible and preserves drafts')
 for(const socket of sockets)socket.close();await service.close();await db.close()
 db=new DatabaseClient(resolve(directory,'test.sqlite'),pathToFileURL(resolve('out/main/database-worker.js')))
 assert.equal((await db.call('getGearDraft',{characterId:a.id,specId:null,activity:'mythicPlus'}))?.name,draft.name);results.push('SQLite restart retains gear plans')
 await writeFile(resolve('.local/integration-results.json'),JSON.stringify({passed:results.length,checks:results},null,2));console.log(JSON.stringify({passed:results.length,checks:results},null,2))
}finally{for(const socket of sockets)socket.close();await service.close().catch(()=>{});await db.close()}
