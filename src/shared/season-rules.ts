import { z } from 'zod'
import { activitySchema, type Activity } from './domain'
import type { EvaluationContext } from './evidence'
import { currencyCostSchema } from './gear-variants'

export const rulesSourceSchema=z.object({title:z.string().min(1),url:z.string().url(),checkedAt:z.string().datetime()})
export const seasonRulesetSchema=z.object({
  schemaVersion:z.literal(1).default(1),id:z.string().min(1),name:z.string().min(1),seasonId:z.string().min(1),builds:z.object({min:z.string().regex(/^\d+(?:\.\d+)*$/),max:z.string().regex(/^\d+(?:\.\d+)*$/)}),regions:z.array(z.string()).default([]),
  effectiveFrom:z.string().datetime(),effectiveUntil:z.string().datetime().nullable().default(null),status:z.enum(['active','announced','retired']),validated:z.boolean().default(false),sources:z.array(rulesSourceSchema).default([]),validationFixtures:z.array(z.string()).default([]),
  candidateCoverage:z.enum(['complete','partial','unknown']).default('unknown'),constraintsCoverage:z.enum(['complete','partial','unknown']).default('unknown'),
  upgradeTracks:z.array(z.object({id:z.string().min(1),name:z.string(),ranks:z.array(z.object({rank:z.number().int().positive(),itemLevel:z.number().nonnegative(),cost:z.array(currencyCostSchema).nullable(),discountRequired:z.boolean().optional()})).min(1)})).default([]),
  restrictions:z.array(z.object({group:z.string().min(1),maxEquipped:z.number().int().nonnegative()})).default([]),minimumGroups:z.array(z.object({group:z.string().min(1),minEquipped:z.number().int().nonnegative()})).default([]),
  rewardTables:z.array(z.object({activity:z.enum([...activitySchema.options,'crafting','world']),difficulty:z.string(),itemLevel:z.number().nonnegative(),sourceUrl:z.string().url()})).default([]),
}).superRefine((rules,ctx)=>{
  if(compareBuilds(rules.builds.min,rules.builds.max)>0)ctx.addIssue({code:'custom',message:'Build range is reversed',path:['builds']})
  if(rules.effectiveUntil&&Date.parse(rules.effectiveUntil)<=Date.parse(rules.effectiveFrom))ctx.addIssue({code:'custom',message:'Rules interval is empty',path:['effectiveUntil']})
  if(new Set(rules.upgradeTracks.map(track=>track.id)).size!==rules.upgradeTracks.length)ctx.addIssue({code:'custom',message:'Duplicate upgrade track'})
  for(const [i,track]of rules.upgradeTracks.entries()){
    if(new Set(track.ranks.map(rank=>rank.rank)).size!==track.ranks.length)ctx.addIssue({code:'custom',message:'Duplicate upgrade rank',path:['upgradeTracks',i]})
    const sorted=[...track.ranks].sort((a,b)=>a.rank-b.rank)
    if(sorted.some((rank,index)=>index>0&&rank.itemLevel<sorted[index-1]!.itemLevel))ctx.addIssue({code:'custom',message:'Upgrade levels must not decrease',path:['upgradeTracks',i]})
  }
})
export type SeasonRuleset=z.infer<typeof seasonRulesetSchema>
export const seasonRulesCatalogSchema=z.object({schemaVersion:z.literal(1),rulesets:z.array(seasonRulesetSchema)})
export type SeasonRulesCatalog=z.infer<typeof seasonRulesCatalogSchema>
export const contentPreferencesSchema=z.object({activities:z.array(activitySchema).default(['mythicPlus','raiding','pvp']),difficulties:z.array(z.string()).default([]),allowCrafting:z.boolean().default(true),excludedMethods:z.array(z.string()).default([])})
export type ContentPreferences=z.infer<typeof contentPreferencesSchema>
export function defaultContentPreferences(activity?:Activity):ContentPreferences{return contentPreferencesSchema.parse(activity?{activities:[activity]}:{})}
export function compareBuilds(a:string,b:string):number {
  const left=a.split('.').map(Number),right=b.split('.').map(Number)
  for(let i=0;i<Math.max(left.length,right.length);i++){const difference=(left[i]??0)-(right[i]??0);if(difference)return Math.sign(difference)}return 0
}
export function rulesetRejectionReasons(rules:SeasonRuleset,context:EvaluationContext):string[]{
  const reasons:string[]=[]
  const now=Date.parse(context.now)
  if(!rules.validated||!rules.sources.length||!rules.validationFixtures.length)reasons.push('This ruleset has not passed source and fixture validation')
  if(rules.sources.some(source=>Date.parse(source.checkedAt)>now+5*60_000))reasons.push('Ruleset source verification is dated in the future')
  if(rules.status!=='active')reasons.push(rules.status==='announced'?'These rules are announced, not available now':'These rules are retired')
  if(!Number.isFinite(now)||now<Date.parse(rules.effectiveFrom)||(rules.effectiveUntil&&now>=Date.parse(rules.effectiveUntil)))reasons.push('These rules are outside their effective interval')
  if(!context.gameBuild||compareBuilds(context.gameBuild,rules.builds.min)<0||compareBuilds(context.gameBuild,rules.builds.max)>0)reasons.push('The installed game build is not supported by these rules')
  if(!context.seasonId||context.seasonId!==rules.seasonId)reasons.push('The current season is not established by these rules')
  if(context.rulesetId&&context.rulesetId!==rules.id)reasons.push('A different ruleset was requested')
  if(rules.regions.length&&(!context.region||!rules.regions.includes(context.region.toLowerCase())))reasons.push('The region is not supported by these rules')
  return reasons
}
export function inspectSeasonRulesets(catalog:SeasonRulesCatalog,context:EvaluationContext){return catalog.rulesets.map(ruleset=>({ruleset,reasons:rulesetRejectionReasons(ruleset,context)}))}
export function resolveSeasonRuleset(catalog:SeasonRulesCatalog,context:EvaluationContext):SeasonRuleset|null {
  const parsed=seasonRulesCatalogSchema.parse(catalog)
  const eligible=inspectSeasonRulesets(parsed,context).filter(entry=>!entry.reasons.length)
  return eligible.length===1?eligible[0]!.ruleset:null
}
