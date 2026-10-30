import { z } from 'zod'
import { activitySchema, type Activity } from './domain'
import type { EvidenceRef, EvaluationContext } from './evidence'

export const sessionGoals=['gear','weekly','score','raidPreparation','cosmetics'] as const
export type SessionGoal=typeof sessionGoals[number]
export const sessionPreferencesSchema=z.object({
  goal:z.enum(sessionGoals).default('gear'),budgetMinutes:z.number().int().min(1).max(1440).nullable().default(60),
  characterIds:z.array(z.string().min(1).max(100)).max(100).default([]),activities:z.array(activitySchema).max(3).default(['mythicPlus','raiding','pvp']),
})
export type SessionPreferences=z.infer<typeof sessionPreferencesSchema>
export type ActionCandidate={
  key:string;characterId:string;characterName:string;activity:Activity;kind:'weekly'|'upgrade'|'plan'|'cosmetic'|'review'
  title:string;reason:string;prerequisites:string[];benefit:Partial<Record<SessionGoal,number>>
  duration:{min:number;max:number;source:'manual'|'observed';samples:number}|null
  deadline:string|null;observedAt:string|null;state:'supported'|'partial';evidenceRefs:EvidenceRef[];assumptions:string[]
  target:'week'|'gear'|'progression'|'wardrobe'|'standings'
}
export type SessionPlan={recommended:ActionCandidate|null;alternatives:ActionCandidate[];unscheduled:ActionCandidate[];excluded:Array<{key:string;reason:string}>;evaluatedAt:string}
export const dispositionSchema=z.object({key:z.string().min(1).max(500),kind:z.enum(['pin','dismiss','snooze']),until:z.string().datetime().nullable().default(null)})
export const sessionStateSchema=z.object({
  schemaVersion:z.literal(1).default(1),preferences:sessionPreferencesSchema.default({goal:'gear',budgetMinutes:60,characterIds:[],activities:['mythicPlus','raiding','pvp']}),
  dispositions:z.array(dispositionSchema).max(1000).default([]),durations:z.record(z.string(),z.number().int().min(1).max(1440)).default({}),
  history:z.array(z.object({actionKey:z.string().max(500),at:z.string().datetime(),minutes:z.number().min(1).max(1440)})).max(500).default([]),
})
export type SessionState=z.infer<typeof sessionStateSchema>
export type SessionWorkspace={state:SessionState;plan:SessionPlan}

export function buildSessionPlan(input:{goal:SessionGoal;actions:ActionCandidate[];budgetMinutes:number|null;pinnedActionKeys:string[];snoozedActionKeys:string[];dismissedActionKeys?:string[];context:EvaluationContext}):SessionPlan {
  const excluded:SessionPlan['excluded']=[],unscheduled:ActionCandidate[]=[],eligible:ActionCandidate[]=[]
  const now=Date.parse(input.context.now),pins=new Set(input.pinnedActionKeys)
  const unique=new Map(input.actions.map(action=>[action.key,action]))
  for(const action of unique.values()){
    let reason:string|null=null
    if(action.deadline&&Date.parse(action.deadline)<=now)reason='This opportunity has expired'
    else if(!(action.benefit[input.goal]!>0))reason='No supported benefit for the selected goal'
    else if(input.dismissedActionKeys?.includes(action.key))reason='Dismissed'
    else if(input.snoozedActionKeys.includes(action.key))reason='Snoozed'
    else if(action.observedAt&&Date.parse(action.observedAt)>now+300_000)reason='Observation time is incompatible'
    else if(input.budgetMinutes!==null&&action.duration&&action.duration.max>input.budgetMinutes)reason='Does not fit your time budget'
    if(reason){excluded.push({key:action.key,reason});continue}
    if(input.budgetMinutes!==null&&!action.duration){unscheduled.push(action);continue}
    eligible.push(action)
  }
  const compare=(a:ActionCandidate,b:ActionCandidate)=>Number(pins.has(b.key))-Number(pins.has(a.key))
    ||(b.benefit[input.goal]??0)-(a.benefit[input.goal]??0)
    ||(a.deadline?Date.parse(a.deadline):Infinity)-(b.deadline?Date.parse(b.deadline):Infinity)
    ||(a.duration?.max??Infinity)-(b.duration?.max??Infinity)||a.key.localeCompare(b.key)
  eligible.sort(compare);unscheduled.sort(compare)
  return {recommended:eligible[0]??null,alternatives:eligible.slice(1,5),unscheduled:unscheduled.slice(0,20),excluded,evaluatedAt:input.context.now}
}
