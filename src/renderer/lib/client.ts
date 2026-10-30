import { createTRPCClient, createWSClient, wsLink } from '@trpc/client'
import type { AppRouter } from '../../main/rpc/router'
import type { Activity, AddCharacterInput, AppSettings, CharacterPatch, GearDraft, Outfit } from '../../shared/domain'
import type { ConnectionInfo, NativeBridge } from '../../shared/bridge'
import type { ItemSearch } from '../../shared/gamedata'
import type { AppearanceSlot } from '../../shared/domain'
import type { ArmorType } from '../../shared/gamedata'
import type { ContentPreferences } from '../../shared/season-rules'
import type { SessionPreferences } from '../../shared/session-plan'
import type {ComparisonInput} from '../../shared/comparisons'
export type BlizzardRegion='us'|'eu'|'kr'|'tw'

async function connection():Promise<ConnectionInfo>{if(window.companion)return window.companion.connection();const response=await fetch('/__companion_runtime',{credentials:'same-origin'});if(!response.ok)throw new Error('Open WOW Companion in the desktop app or start the local development service');return response.json()}
let ready:Promise<ReturnType<typeof createTRPCClient<AppRouter>>>|undefined
let ws:ReturnType<typeof createWSClient>|undefined
async function client(){return ready??=(async()=>{const info=await connection();ws=createWSClient({url:info.url,connectionParams:{token:info.token},retryDelayMs:attempt=>Math.min(1000*2**attempt,15000)});return createTRPCClient<AppRouter>({links:[wsLink({client:ws})]})})()}
async function native<K extends keyof NativeBridge>(method:K,...args:Parameters<NativeBridge[K]>):Promise<Awaited<ReturnType<NativeBridge[K]>>>{if(!window.companion)throw new Error('This file action is available in the desktop app');const fn=window.companion[method] as (...values:unknown[])=>Promise<unknown>;return fn(...args) as Promise<Awaited<ReturnType<NativeBridge[K]>>>}
export const api={
 listCharacters:async()=>(await client()).listCharacters.query(),
 addCharacter:async(input:AddCharacterInput)=>(await client()).addCharacter.mutate(input),
 updateCharacter:async(input:{id:string;patch:CharacterPatch})=>(await client()).updateCharacter.mutate(input),
 deleteCharacter:async(input:{id:string})=>(await client()).deleteCharacter.mutate(input),
 archiveCharacter:async(input:{id:string;archived:boolean})=>(await client()).archiveCharacter.mutate(input),
 getGearDraft:async(input:{characterId:string;activity:Activity;specId:number|null})=>(await client()).getGearDraft.query(input),
 saveGearDraft:async(input:GearDraft)=>(await client()).saveGearDraft.mutate(input),
 listOutfits:async(input:{characterId:string})=>(await client()).listOutfits.query(input),
 saveOutfit:async(input:Outfit)=>(await client()).saveOutfit.mutate(input),
 deleteOutfit:async(input:{id:string})=>(await client()).deleteOutfit.mutate(input),
 getSettings:async()=>(await client()).getSettings.query(),
 saveSettings:async(input:Partial<AppSettings>)=>(await client()).saveSettings.mutate(input),
 getProgression:async(input:{characterId:string;activity:Activity})=>(await client()).getProgression.query(input),
 sessionWorkspace:async(input:{characterId:string})=>(await client()).sessionWorkspace.query(input),
 saveSessionPreferences:async(input:{characterId:string;preferences:SessionPreferences})=>(await client()).saveSessionPreferences.mutate(input),
 setSessionDisposition:async(input:{characterId:string;key:string;kind:'pin'|'dismiss'|'snooze';until:string|null})=>(await client()).setSessionDisposition.mutate(input),
 undoSessionDisposition:async(input:{characterId:string;key:string})=>(await client()).undoSessionDisposition.mutate(input),
 setSessionDuration:async(input:{characterId:string;key:string;minutes:number;completed?:boolean})=>(await client()).setSessionDuration.mutate(input),
 simulationWorkspace:async(input:{characterId:string})=>(await client()).simulationWorkspace.query(input),
 comparePlayers:async(input:ComparisonInput)=>(await client()).comparePlayers.query(input),
 comparisonReports:async(input:{characterId:string})=>(await client()).comparisonReports.query(input),
 pvpBrackets:async(input:{characterId:string;region:'us'|'eu'})=>(await client()).pvpBrackets.query(input),
 logsStatus:async()=>(await client()).logsStatus.query(),
 configureLogs:async(input:{clientId:string;clientSecret:string})=>(await client()).configureLogs.mutate(input),
 clearLogs:async()=>(await client()).clearLogs.mutate(),
 reportSummary:async(input:{characterId:string;url:string})=>(await client()).reportSummary.mutate(input),
 saveComparisonReport:async(input:{characterId:string;url:string;notes:string})=>(await client()).saveComparisonReport.mutate(input),
 simulationProfile:async(input:{characterId:string})=>(await client()).simulationProfile.query(input),
 importSimulationProfile:async(input:{characterId:string;text:string})=>(await client()).importSimulationProfile.mutate(input),
 clearSimulationProfile:async(input:{characterId:string})=>(await client()).clearSimulationProfile.mutate(input),
 saveSimulationReport:async(input:{characterId:string;url:string;notes:string})=>(await client()).saveSimulationReport.mutate(input),
 startSimulation:async(input:{characterId:string;activity:Activity;scenarioId:'patchwerk'|'dungeon-slice';iterations?:number;threads?:number;timeoutMinutes?:number;comparePlan?:boolean})=>(await client()).startSimulation.mutate(input),
 cancelSimulation:async(input:{characterId:string;jobId:string})=>(await client()).cancelSimulation.mutate(input),
 chooseSimulationExecutable:()=>native('chooseSimulationExecutable'),
 getModel:async(input:{characterId:string})=>(await client()).getModel.query(input),
 forgetModel:async(input:{characterId:string})=>(await client()).forgetModel.mutate(input),
 chooseModelFile:(characterId:string)=>native('chooseModelFile',characterId),
 getContentPreferences:async(input:{characterId:string;activity:Activity})=>(await client()).getContentPreferences.query(input),
 saveContentPreferences:async(input:{characterId:string;activity:Activity;preferences:ContentPreferences})=>(await client()).saveContentPreferences.mutate(input),
 importText:async(input:{text:string})=>(await client()).importText.mutate(input),
 refreshCharacter:async(input:{id:string})=>(await client()).refreshCharacter.mutate(input),
 getSyncStatus:async()=>(await client()).getSyncStatus.query(),
 syncState:async()=>(await client()).syncState.query(),
 syncNow:async(trigger:'manual'|'focus'='manual')=>(await client()).syncNow.mutate({trigger}),
 gameDataStatus:async()=>(await client()).gameDataStatus.query(),
 searchItems:async(input:ItemSearch)=>(await client()).searchItems.query(input),
 getItem:async(id:number)=>(await client()).getItem.query({id}),
 getItems:async(ids:number[])=>(await client()).getItems.query({ids}),
 enhancements:async(input:{kind:'enchant'|'gem';slot:AppearanceSlot|null})=>(await client()).enhancements.query(input),
 appearanceOptions:async(input:{slot:AppearanceSlot;text:string;armor:ArmorType|null})=>(await client()).appearanceOptions.query(input),
 enchantNames:async(ids:number[])=>(await client()).enchantNames.query({ids}),
 connectionsStatus:async()=>(await client()).connectionsStatus.query(),
 detectInstall:async()=>(await client()).detectInstall.mutate(),
 rebuildItemData:async()=>(await client()).rebuildItemData.mutate(),
 installAddon:async()=>(await client()).installAddon.mutate(),
 removeAddon:async()=>(await client()).removeAddon.mutate(),
 useSavedVariables:async(account:string)=>(await client()).useSavedVariables.mutate({account}),
 setBlizzardKey:async(input:{clientId:string;clientSecret:string;region:BlizzardRegion})=>(await client()).setBlizzardKey.mutate(input),
 clearBlizzardKey:async()=>(await client()).clearBlizzardKey.mutate(),
 realms:async(region:BlizzardRegion)=>(await client()).realms.query({region}),
 topPlayers:async(input:{specId:number;specName:string;className:string;region:'us'|'eu'|'world';force?:boolean})=>(await client()).topPlayers.query(input),
 itemTooltip:async(id:number)=>(await client()).itemTooltip.query({id}),
 wowToken:async(region:BlizzardRegion)=>(await client()).wowToken.query({region}),
 addBlizzardCharacter:async(input:{region:BlizzardRegion;realm:string;name:string})=>(await client()).addBlizzardCharacter.mutate(input),
 beginBattlenetSignIn:async()=>(await client()).beginBattlenetSignIn.mutate(),
 completeBattlenetSignIn:async()=>(await client()).completeBattlenetSignIn.mutate(),
 cancelBattlenetSignIn:async()=>(await client()).cancelBattlenetSignIn.mutate(),
 accountCharacters:async()=>(await client()).accountCharacters.query(),
 importAccountCharacters:async(characters:Array<{name:string;realm:string}>)=>(await client()).importAccountCharacters.mutate({characters}),
 signOutBattlenet:async()=>(await client()).signOutBattlenet.mutate(),
  chooseWowFolder:()=>native('chooseWowFolder'),
  chooseImportFile:()=>native('chooseImportFile'),chooseWatchFile:()=>native('chooseWatchFile'),
 exportBackup:()=>native('exportBackup'),importBackup:()=>native('importBackup'),
 openExternal:async(url:string)=>{if(window.companion)return window.companion.openExternal(url);window.open(url,'_blank','noopener,noreferrer')},
 subscribe(callback:()=>void){let cancelled=false;let unsubscribe:(()=>void)|undefined;void client().then(c=>{if(cancelled)return;const sub=c.changes.subscribe(undefined,{onData:callback,onStarted:callback,onError:()=>callback()});unsubscribe=()=>sub.unsubscribe()}).catch(()=>callback());return()=>{cancelled=true;unsubscribe?.()}},
}
export type Api=typeof api
