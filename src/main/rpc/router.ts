import { initTRPC, TRPCError } from '@trpc/server'
import { observable } from '@trpc/server/observable'
import { EventEmitter } from 'node:events'
import { Effect } from 'effect'
import { z } from 'zod'
import { addCharacterSchema, appSettingsPatchSchema, characterPatchSchema, activitySchema, gearDraftSchema, outfitSchema } from '../../shared/domain'
import type { DatabaseClient } from '../database'
import type { GameDataClient } from '../gamedata/client'
import type { Connections } from '../connections/service'
import type { Insights } from '../insights'
import type { Sync } from '../sync'
import type { ProgressionService } from '../progression/service'
import { contentPreferencesSchema } from '../../shared/season-rules'
import { appearanceSlotSchema } from '../../shared/domain'
import { armorTypes, itemSearchSchema } from '../../shared/gamedata'
import { blizzardRegions } from '../providers/blizzard'
import type { SessionService } from '../session/service'
import { sessionPreferencesSchema, dispositionSchema } from '../../shared/session-plan'
import type { SimulationService } from '../simulation/service'
import type { ComparisonService } from '../comparisons/service'
import {comparisonInputSchema,reportInputSchema} from '../../shared/comparisons'

export type SyncStatus = { lastCheckAt:string|null;path:string|null;error:string|null }
export type ChangeEvent = { revision:number;characterId?:string }
export type ServiceContext = { authorized:boolean }
export type RouterServices = {
  db:DatabaseClient;events:EventEmitter
  changed(characterId?:string):Promise<void>
  importText(text:string):Promise<import('../../shared/domain').ImportReport>
  syncStatus():SyncStatus
  refreshCharacter(id:string):Promise<import('../../shared/domain').Character>
  gameData:GameDataClient
  connections:Connections
  insights:Insights
  sync:Sync
  progression:ProgressionService
  session:SessionService
  simulations:SimulationService
  comparisons:ComparisonService
  models:ReturnType<typeof import('../models/cache').createModelCache>
}
const t=initTRPC.context<ServiceContext>().create()
const p=t.procedure.use(({ctx,next})=>{if(!ctx.authorized)throw new TRPCError({code:'UNAUTHORIZED',message:'The local connection was not authorized'});return next()})
const idSchema=z.object({id:z.string().min(1).max(100)})
const characterIdSchema=z.object({characterId:z.string().min(1).max(100)})
const run=<T>(operation:()=>Promise<T>)=>Effect.runPromise(Effect.tryPromise({try:operation,catch:error=>new TRPCError({code:'BAD_REQUEST',message:error instanceof z.ZodError?(error.issues[0]?.message??'Some details are not valid'):error instanceof Error?error.message:'The local operation failed'})}))

export function createRouter(s:RouterServices){return t.router({
  listCharacters:p.query(()=>run(()=>s.db.call('listCharacters',true))),
  addCharacter:p.input(addCharacterSchema).mutation(async({input})=>{const c=await run(()=>s.db.call('addCharacter',input));await s.changed(c.id);return c}),
  updateCharacter:p.input(idSchema.extend({patch:characterPatchSchema})).mutation(async({input})=>{const c=await run(()=>s.db.call('updateCharacter',input.id,input.patch));await s.changed(c.id);return c}),
  deleteCharacter:p.input(idSchema).mutation(async({input})=>{const result=await run(()=>s.db.call('deleteCharacter',input.id));await s.connections.forgetRenders(input.id);await s.changed();return result}),
  archiveCharacter:p.input(idSchema.extend({archived:z.boolean()})).mutation(async({input})=>{await run(()=>s.db.call(input.archived?'archiveCharacter':'restoreCharacter',input.id));await s.changed(input.id)}),
  getGearDraft:p.input(characterIdSchema.extend({activity:activitySchema,specId:z.number().int().nullable(),rulesetId:z.string().optional()})).query(({input})=>run(()=>s.db.call('getGearDraft',input))),
  saveGearDraft:p.input(gearDraftSchema).mutation(async({input})=>{const draft=await run(()=>s.db.call('saveGearDraft',input));await s.changed(input.characterId);return draft}),
  listOutfits:p.input(characterIdSchema).query(({input})=>run(()=>s.db.call('listOutfits',input.characterId))),
  saveOutfit:p.input(outfitSchema).mutation(async({input})=>{const outfit=await run(()=>s.db.call('saveOutfit',input));await s.changed(input.characterId);return outfit}),
  deleteOutfit:p.input(idSchema).mutation(async({input})=>{await run(()=>s.db.call('deleteOutfit',input.id));await s.changed()}),
  getSettings:p.query(()=>run(()=>s.db.call('getSettings'))),
  saveSettings:p.input(appSettingsPatchSchema).mutation(({input})=>run(()=>s.db.call('setSettings',input))),
  getProgression:p.input(characterIdSchema.extend({activity:activitySchema})).query(({input})=>run(()=>s.progression.evaluate(input.characterId,input.activity))),
  sessionWorkspace:p.input(characterIdSchema).query(({input})=>run(()=>s.session.workspace(input.characterId))),
  saveSessionPreferences:p.input(characterIdSchema.extend({preferences:sessionPreferencesSchema})).mutation(async({input})=>{const result=await run(()=>s.session.preferences(input.characterId,input.preferences));await s.changed(input.characterId);return result}),
  setSessionDisposition:p.input(characterIdSchema.extend(dispositionSchema.shape)).mutation(async({input})=>{const result=await run(()=>s.session.disposition(input.characterId,input));await s.changed(input.characterId);return result}),
  undoSessionDisposition:p.input(characterIdSchema.extend({key:z.string().min(1).max(500)})).mutation(async({input})=>{const result=await run(()=>s.session.undo(input.characterId,input.key));await s.changed(input.characterId);return result}),
  setSessionDuration:p.input(characterIdSchema.extend({key:z.string().min(1).max(500),minutes:z.number().int().min(1).max(1440),completed:z.boolean().default(false)})).mutation(async({input})=>{const result=await run(()=>s.session.duration(input.characterId,input.key,input.minutes,input.completed));await s.changed(input.characterId);return result}),
  simulationWorkspace:p.input(characterIdSchema).query(({input})=>run(()=>s.simulations.list(input.characterId))),
  getModel:p.input(characterIdSchema).query(({input})=>run(()=>s.models.get(input.characterId))),
  forgetModel:p.input(characterIdSchema).mutation(async({input})=>{await run(()=>s.models.forget(input.characterId));await s.changed(input.characterId)}),
  comparePlayers:p.input(comparisonInputSchema).query(({input})=>run(()=>s.comparisons.evaluate(input))),
  comparisonReports:p.input(characterIdSchema).query(({input})=>run(()=>s.comparisons.reports(input.characterId))),
  pvpBrackets:p.input(characterIdSchema.extend({region:z.enum(['us','eu'])})).query(({input})=>run(()=>s.comparisons.pvpBrackets(input))),
  logsStatus:p.query(()=>run(()=>s.comparisons.logsStatus())),
  configureLogs:p.input(z.object({clientId:z.string().min(1).max(200),clientSecret:z.string().min(1).max(500)})).mutation(({input})=>run(()=>s.comparisons.configureLogs(input))),
  clearLogs:p.mutation(()=>run(()=>s.comparisons.clearLogs())),
  reportSummary:p.input(characterIdSchema.extend({url:z.string().url().max(2000)})).mutation(({input})=>run(()=>s.comparisons.reportSummary(input))),
  saveComparisonReport:p.input(reportInputSchema).mutation(async({input})=>{const value=await run(()=>s.comparisons.saveReport(input));await s.changed(input.characterId);return value}),
  simulationProfile:p.input(characterIdSchema).query(({input})=>run(()=>s.simulations.exportProfile(input.characterId))),
  importSimulationProfile:p.input(characterIdSchema.extend({text:z.string().min(1).max(1024*1024)})).mutation(async({input})=>{const value=await run(()=>s.simulations.importProfile(input.characterId,input.text));await s.changed(input.characterId);return value}),
  clearSimulationProfile:p.input(characterIdSchema).mutation(async({input})=>{const value=await run(()=>s.simulations.clearProfile(input.characterId));await s.changed(input.characterId);return value}),
  saveSimulationReport:p.input(characterIdSchema.extend({url:z.string().url().max(2000),notes:z.string().max(4000)})).mutation(async({input})=>{const value=await run(()=>s.simulations.saveReport(input.characterId,input.url,input.notes));await s.changed(input.characterId);return value}),
  startSimulation:p.input(characterIdSchema.extend({activity:activitySchema,scenarioId:z.enum(['patchwerk','dungeon-slice']),iterations:z.number().int().min(100).max(1000000).optional(),threads:z.number().int().min(1).max(32).optional(),timeoutMinutes:z.number().int().min(1).max(120).optional(),comparePlan:z.boolean().optional()})).mutation(({input})=>run(()=>s.simulations.startJob(input))),
  cancelSimulation:p.input(characterIdSchema.extend({jobId:z.string().min(1).max(100)})).mutation(({input})=>run(()=>s.simulations.cancelJob(input.characterId,input.jobId))),
  getContentPreferences:p.input(characterIdSchema.extend({activity:activitySchema})).query(({input})=>run(()=>s.progression.getContentPreferences(input.characterId,input.activity))),
  saveContentPreferences:p.input(characterIdSchema.extend({activity:activitySchema,preferences:contentPreferencesSchema})).mutation(async({input})=>{const result=await run(()=>s.progression.saveContentPreferences(input.characterId,input.activity,input.preferences));await s.changed(input.characterId);return result}),
  importText:p.input(z.object({text:z.string().min(1).max(16*1024*1024)})).mutation(({input})=>run(()=>s.importText(input.text))),
  getSyncStatus:p.query(()=>s.syncStatus()),
  syncState:p.query(()=>s.sync.state),
  syncNow:p.input(z.object({trigger:z.enum(['manual','focus']).default('manual')})).mutation(({input})=>run(()=>s.sync.run(input.trigger))),
  refreshCharacter:p.input(idSchema).mutation(async({input})=>{const c=await run(()=>s.refreshCharacter(input.id));await s.changed(input.id);return c}),
  // Item data from the local game install
  gameDataStatus:p.query(()=>s.gameData.currentStatus),
  searchItems:p.input(itemSearchSchema).query(({input})=>run(()=>s.gameData.call('search',input))),
  getItem:p.input(z.object({id:z.number().int().positive()})).query(({input})=>run(()=>s.gameData.call('item',input.id))),
  getItems:p.input(z.object({ids:z.array(z.number().int().positive()).max(200)})).query(({input})=>run(()=>s.gameData.call('items',input.ids))),
  enhancements:p.input(z.object({kind:z.enum(['enchant','gem']),slot:appearanceSlotSchema.nullable()})).query(({input})=>run(()=>s.gameData.call('enhancements',input.kind,input.slot))),
  appearanceOptions:p.input(z.object({slot:appearanceSlotSchema,text:z.string().max(100),armor:z.enum(armorTypes).nullable()})).query(({input})=>run(()=>s.gameData.call('appearanceOptions',input.slot,input.text,input.armor))),
  enchantNames:p.input(z.object({ids:z.array(z.number().int().positive()).max(200)})).query(({input})=>run(()=>s.gameData.call('enchantNames',input.ids))),
  // Public insights: top players for a spec and the WoW Token price
  topPlayers:p.input(z.object({specId:z.number().int().positive(),specName:z.string().min(1).max(60),className:z.string().min(1).max(60),region:z.enum(['us','eu','world']).default('us'),force:z.boolean().optional()})).query(({input})=>run(()=>s.insights.topPlayers(input))),
  itemTooltip:p.input(z.object({id:z.number().int().positive()})).query(({input})=>run(()=>s.insights.itemTooltip(input.id))),
  wowToken:p.input(z.object({region:z.enum(blizzardRegions)})).query(({input})=>run(()=>s.insights.wowToken(input.region))),
  // Connections: install, addon, Blizzard key, Battle.net
  connectionsStatus:p.query(()=>run(()=>s.connections.status())),
  detectInstall:p.mutation(()=>run(()=>s.connections.detectInstall())),
  rebuildItemData:p.mutation(()=>run(()=>s.connections.rebuildIndex())),
  installAddon:p.mutation(()=>run(()=>s.connections.installAddon())),
  removeAddon:p.mutation(()=>run(()=>s.connections.removeAddon())),
  useSavedVariables:p.input(z.object({account:z.string().min(1).max(100)})).mutation(({input})=>run(()=>s.connections.useSavedVariables(input.account))),
  setBlizzardKey:p.input(z.object({clientId:z.string().max(200),clientSecret:z.string().max(200),region:z.enum(blizzardRegions)})).mutation(({input})=>run(()=>s.connections.setBlizzardKey(input))),
  clearBlizzardKey:p.mutation(()=>run(()=>s.connections.clearBlizzardKey())),
  realms:p.input(z.object({region:z.enum(blizzardRegions)})).query(({input})=>run(()=>s.connections.realms(input.region))),
  addBlizzardCharacter:p.input(z.object({region:z.enum(blizzardRegions),realm:z.string().min(1).max(100),name:z.string().min(1).max(100)})).mutation(({input})=>run(()=>s.connections.addCharacter(input))),
  beginBattlenetSignIn:p.mutation(()=>run(()=>s.connections.beginSignIn())),
  completeBattlenetSignIn:p.mutation(()=>run(()=>s.connections.completeSignIn())),
  cancelBattlenetSignIn:p.mutation(()=>s.connections.cancelSignIn()),
  accountCharacters:p.query(()=>run(()=>s.connections.accountCharacters())),
  importAccountCharacters:p.input(z.object({characters:z.array(z.object({name:z.string().min(1).max(100),realm:z.string().min(1).max(100)})).max(60)})).mutation(({input})=>run(()=>s.connections.importAccountCharacters(input.characters))),
  signOutBattlenet:p.mutation(()=>run(()=>s.connections.signOut())),
  changes:p.subscription(()=>observable<ChangeEvent>(emit=>{const listener=(event:ChangeEvent)=>emit.next(event);s.events.on('changed',listener);return()=>s.events.off('changed',listener)})),
})}
export type AppRouter=ReturnType<typeof createRouter>
