import type { DatabaseClient } from '../database'
import type { ProgressionService } from '../progression/service'
import type { ActionCandidate,SessionState,SessionWorkspace } from '../../shared/session-plan'
import { buildSessionPlan,sessionStateSchema,sessionPreferencesSchema,dispositionSchema } from '../../shared/session-plan'
import { vaultTracks,nextWeeklyReset } from '../../shared/weekly'
import { comparePlanCompletion } from '../../shared/plan-completion'
import type { Activity,Character } from '../../shared/domain'
import {appearanceObservationFromCharacter,evaluateOutfitOwnership} from '../../shared/outfits'

export function createSessionService(options:{db:Pick<DatabaseClient,'call'>;progression:ProgressionService;now?:()=>Date}){
  const now=()=>options.now?.()??new Date()
  async function load(id:string):Promise<SessionState>{const raw=await options.db.call('getFeatureState',id,'session');return sessionStateSchema.parse(raw??{preferences:{characterIds:[id]}})}
  async function save(id:string,state:SessionState){await options.db.call('saveFeatureState',id,'session',sessionStateSchema.parse(state));return state}
  async function actions(character:Character,activities:Activity[],state:SessionState):Promise<ActionCandidate[]>{
    const output:ActionCandidate[]=[],at=now().toISOString(),reset=nextWeeklyReset(character.region,Date.parse(at))
    const add=(action:ActionCandidate)=>{
      const manual=state.durations[action.key],history=state.history.filter(h=>h.actionKey===action.key)
      if(manual)action.duration={min:manual,max:manual,source:'manual',samples:1}
      else if(history.length)action.duration={min:Math.min(...history.map(h=>h.minutes)),max:Math.max(...history.map(h=>h.minutes)),source:'observed',samples:history.length}
      output.push(action)
    }
    for(const track of vaultTracks(character.weekly,character.region,Date.parse(at))){
      const activity:Activity=track.kind==='raid'?'raiding':'mythicPlus'
      if(track.kind==='world'||!activities.includes(activity)||!track.exact||!track.remaining||track.progress===null)continue
      const snapshot=character.weekly.addon
      add({key:`${character.id}:vault:${track.kind}:${snapshot?.weekStart}:${track.slots.find(s=>!s.unlocked)?.threshold}`,characterId:character.id,characterName:character.name,activity,kind:'weekly',title:`Complete ${track.remaining} more ${track.kind==='raid'?'raid boss kills':'dungeon runs'}`,reason:`Your observed Great Vault progress is ${track.progress}; ${track.remaining} more unlocks the next reward option`,prerequisites:['Check the required difficulty and reward level in your in-game Great Vault'],benefit:{weekly:1,gear:1,raidPreparation:track.kind==='raid'?1:0},duration:null,deadline:reset?new Date(reset).toISOString():null,observedAt:snapshot?.observedAt??null,state:'partial',evidenceRefs:[],assumptions:['Weekly thresholds describe saved observations, not live progress','A Vault unlock provides an option, not a guaranteed upgrade'],target:'week'})
    }
    for(const activity of activities){
      const draft=await options.db.call('getGearDraft',{characterId:character.id,activity,specId:character.specId})
      if(draft)for(const row of comparePlanCompletion(character.gear,draft.items)){
        if(row.complete)continue
        const planned=draft.items.find(item=>item.slot===row.slot)
        if(!planned)continue
        const acquisition=row.acquisition!=='complete'
        add({key:`${character.id}:plan:${activity}:${row.slot}:${planned.itemId??planned.name}`,characterId:character.id,characterName:character.name,activity,kind:'plan',title:acquisition?`Work toward ${planned.name}`:`Finish enhancements or upgrades for ${planned.name}`,reason:row.reasons.join(' · ')||'This saved gear goal is not complete',prerequisites:acquisition?['Confirm the acquisition source and availability in game']:['Check current rank, sockets and enchant eligibility in game'],benefit:{gear:1,raidPreparation:1},duration:null,deadline:null,observedAt:character.gearObservedAt,state:'partial',evidenceRefs:[],assumptions:['A saved target is a personal goal, not a simulated best-in-slot verdict'],target:'gear'})
      }
      const result=await options.progression.evaluate(character.id,activity).catch(()=>null)
      if(result?.affordable.status==='supported'&&result.affordable.itemLevel!==null&&result.equipped.itemLevel!==null&&result.affordable.itemLevel>result.equipped.itemLevel){
        add({key:`${character.id}:affordable:${activity}:${result.affordable.itemLevel}`,characterId:character.id,characterName:character.name,activity,kind:'upgrade',title:'Apply an affordable upgrade plan',reason:`The supported set reaches ${result.affordable.itemLevel.toFixed(1)} equipped item level using shared observed currency balances`,prerequisites:result.affordable.costs.map(c=>`${c.spent} ${c.currencyId}`),benefit:{gear:result.affordable.itemLevel-result.equipped.itemLevel,raidPreparation:1},duration:null,deadline:null,observedAt:character.progressionResources?.observedAt??null,state:'supported',evidenceRefs:result.affordable.evidenceRefs,assumptions:result.assumptions,target:'progression'})
      }
    }
    const activity=activities[0]
    if(activity){
      const outfits=await options.db.call('listOutfits',character.id)
      for(const outfit of outfits){
        const pending=evaluateOutfitOwnership(outfit,[appearanceObservationFromCharacter(character)]).filter(row=>row.state==='missing'||row.state==='unknown')
        if(!pending.length)continue
        add({key:`${character.id}:outfit:${outfit.id}`,characterId:character.id,characterName:character.name,activity,kind:'cosmetic',title:`Work on ${outfit.name}`,reason:`${pending.length} planned appearance${pending.length===1?'':'s'} ${pending.every(row=>row.state==='missing')?'remain to collect':'need an ownership or acquisition check'}`,prerequisites:outfit.acquisitionTargets.map(target=>target.note).filter(Boolean),benefit:{cosmetics:pending.length},duration:null,deadline:null,observedAt:character.collectionObservedAt,state:'partial',evidenceRefs:[],assumptions:['Partial collection captures cannot establish that an appearance is missing','Acquisition availability must be confirmed at the recorded source'],target:'wardrobe'})
      }
    }
    if(activities.includes('mythicPlus')&&character.ratings.mythicPlus?.value!==null&&character.ratings.mythicPlus?.observedAt){
      add({key:`${character.id}:score-review:${character.ratings.mythicPlus.seasonId}`,characterId:character.id,characterName:character.name,activity:'mythicPlus',kind:'review',title:'Choose your next Mythic+ score target',reason:'Review your saved score, comparable players and recent runs before choosing a key',prerequisites:['Check the season, key level and current group requirements'],benefit:{score:1},duration:null,deadline:null,observedAt:character.ratings.mythicPlus.observedAt,state:'partial',evidenceRefs:[],assumptions:['This is a review action, not a predicted score gain or guaranteed timed run'],target:'standings'})
    }
    return output
  }
  return {
    async workspace(characterId:string):Promise<SessionWorkspace>{
      const state=await load(characterId),characters=await options.db.call('listCharacters',false)
      const selected=characters.filter(c=>state.preferences.characterIds.includes(c.id)&&!c.archived)
      const all=(await Promise.all(selected.map(c=>actions(c,state.preferences.activities,state)))).flat(),time=now().toISOString()
      const active=state.dispositions.filter(d=>!d.until||Date.parse(d.until)>Date.parse(time))
      const result=buildSessionPlan({goal:state.preferences.goal,actions:all,budgetMinutes:state.preferences.budgetMinutes,pinnedActionKeys:active.filter(d=>d.kind==='pin').map(d=>d.key),snoozedActionKeys:active.filter(d=>d.kind==='snooze').map(d=>d.key),dismissedActionKeys:active.filter(d=>d.kind==='dismiss').map(d=>d.key),context:{now:time,gameBuild:null,seasonId:null,rulesetId:null}})
      // A deleted anchor cannot be recreated by an evaluation finishing late
      if(!await options.db.call('getCharacter',characterId))throw Error('Character was removed')
      return {state,plan:result}
    },
    async preferences(id:string,input:unknown){const state=await load(id),preferences=sessionPreferencesSchema.parse(input);const ids=new Set((await options.db.call('listCharacters',false)).map(c=>c.id));if(preferences.characterIds.some(id=>!ids.has(id)))throw Error('Choose characters in this roster');state.preferences=preferences;return save(id,state)},
    async disposition(id:string,input:unknown){const state=await load(id),value=dispositionSchema.parse(input);state.dispositions=state.dispositions.filter(d=>d.key!==value.key);state.dispositions.push(value);return save(id,state)},
    async undo(id:string,key:string){const state=await load(id);state.dispositions=state.dispositions.filter(d=>d.key!==key);return save(id,state)},
    async duration(id:string,key:string,minutes:number,completed=false){if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw Error('Enter minutes from 1 to 1440');const state=await load(id);if(completed)state.history=[...state.history,{actionKey:key,at:now().toISOString(),minutes}].slice(-500);else state.durations[key]=minutes;return save(id,state)},
  }
}
export type SessionService=ReturnType<typeof createSessionService>
