import { z } from 'zod'
import { activitySchema, type Activity } from './domain'
import type { EvidenceRef } from './evidence'

export const comparisonInputSchema=z.object({characterId:z.string().min(1).max(100),activity:activitySchema,population:z.enum(['leaders','peers','history']),region:z.enum(['us','eu','world']).optional(),pvpBracket:z.string().regex(/^[a-z0-9-]{1,100}$/).optional(),keyLevel:z.number().int().min(1).max(100).nullable().optional(),encounter:z.string().trim().max(120).nullable().optional(),difficulty:z.string().trim().max(80).nullable().optional(),reportUrl:z.string().url().max(2048).nullable().optional()})
export type ComparisonInput=z.infer<typeof comparisonInputSchema>
export const reportInputSchema=z.object({characterId:z.string().min(1).max(100),url:z.string().url().max(2048),notes:z.string().max(2000).default('')})
export const logsCredentialsSchema=z.object({clientId:z.string().trim().min(1).max(200).regex(/^[^\s:\u0000-\u001f\u007f]+$/),clientSecret:z.string().trim().min(1).max(500).regex(/^[^\u0000-\u001f\u007f]+$/)})
export type LogsStatus={configured:boolean;persistent:boolean;clientIdHint:string|null;retryAt:string|null}
export type PvpBracketIndex={configured:boolean;seasonId:number|null;region:'us'|'eu';retrievedAt:string|null;brackets:Array<{slug:string;name:string;specId:number|null}>}
export const reportSummarySchema=z.object({schemaVersion:z.literal(1),adapterVersion:z.literal('wcl-summary-v1'),code:z.string().regex(/^[A-Za-z0-9]{16}$/),url:z.string().url(),title:z.string().max(500),revision:z.number().int().nonnegative(),startAt:z.string().datetime(),endAt:z.string().datetime(),retrievedAt:z.string().datetime(),region:z.string().nullable(),visibility:z.literal('public'),gameVersion:z.number().int().nullable(),actorMatch:z.enum(['matched','not-found','ambiguous','region-unknown','different-region']),actorId:z.number().int().positive().nullable(),actorName:z.string().nullable(),fights:z.array(z.object({id:z.number().int().positive(),encounterId:z.number().int().nonnegative(),name:z.string().max(200),difficulty:z.number().int().nullable(),kill:z.boolean().nullable(),inProgress:z.boolean().nullable(),startOffsetMs:z.number().nonnegative(),endOffsetMs:z.number().nonnegative(),participated:z.boolean().nullable()})).max(1000),coverage:z.enum(['complete','partial']),limitations:z.array(z.string()).max(20)})
export type ReportSummary=z.infer<typeof reportSummarySchema>
export type ComparisonReport={id:string;url:string;notes:string;createdAt:string;updatedAt:string;observedAt:null;adapterState:'unconfigured'|'summary';summary?:ReportSummary}
export type ComparisonContext={activity:Activity;specId:number|null;role:string|null;region:string;seasonId:string|null;partition:string|null;encounter:string|null;difficulty:string|null;keyLevel:number|null;gearBracket:null;from:string|null;to:string}
export type PopulationDescriptor={provider:string;selectionMethod:'spec-leaderboard'|'top-run-sample'|'tracked-roster'|'character-history'|'pvp-bracket';label:string;sampleSize:number;fullDenominator:number|null;coverage:'complete'|'partial'|'unknown';sourceUrl:string|null;observedAt:string|null;retrievedAt:string|null;requestedFilters:Record<string,string>;actualFilters:Record<string,string>;unsupportedFilters:string[]}
export type ComparisonRecord={id:string;name:string;realm:string;region:string;metricId:string;metricName:string;unit:string;value:number|null;activity:Activity;specId:number|null;seasonId:string|null;partition:string|null;observedAt:string|null;retrievedAt:string|null;source:string;sourceUrl:string|null;rank:number|null;rankScope:string|null;population:number|null;evidenceRefs:EvidenceRef[]}
export type ComparisonDifference={slot:string;itemId:number;name:string;count:number;sampleSize:number;equipped:boolean;kind:'sample-frequency';sourceUrl:string|null}
export type ComparisonResult={schemaVersion:1;status:'supported'|'partial'|'unsupported';context:ComparisonContext;player:ComparisonRecord;population:PopulationDescriptor;records:ComparisonRecord[];providerRank:{rank:number;scope:string;population:number|null}|null;percentile:null;gapToSampleBest:number|null;reasons:string[];assumptions:string[];evidenceRefs:EvidenceRef[];gearDifferences:ComparisonDifference[];builds:Array<{loadout:string;count:number;sampleSize:number;equipped:boolean}>;reportReview:{state:'unconfigured';reason:string};evaluatedAt:string}

function contextMatches(record:ComparisonRecord,context:ComparisonContext,metricId:string){
  return record.activity===context.activity&&record.specId===context.specId&&record.seasonId===context.seasonId&&record.metricId===metricId&&(context.region==='world'||record.region.toLowerCase()===context.region.toLowerCase())&&(!context.partition||record.partition===context.partition)
}

/** A filtered sample never establishes a whole-population percentile or changes native rank scope */
export function comparePopulation(input:{context:ComparisonContext;player:ComparisonRecord;population:PopulationDescriptor;records:ComparisonRecord[]}):ComparisonResult {
  const {context,player}=input,population={...input.population,requestedFilters:{...input.population.requestedFilters},actualFilters:{...input.population.actualFilters}}
  const reasons:string[]=[],assumptions:string[]=[]
  const bracketScope=context.activity==='pvp'&&population.selectionMethod==='pvp-bracket'&&population.actualFilters.spec==='All specializations in this bracket'
  const eligible=(context.specId!==null||bracketScope)&&context.seasonId!==null&&player.value!==null
  if(context.specId===null&&!bracketScope)reasons.push('The current specialization is unknown')
  if(context.seasonId===null)reasons.push('The rating season is unknown, so other seasons cannot be compared safely')
  if(player.value===null)reasons.push('No numerical rating is recorded for this activity and metric')
  if(population.unsupportedFilters.length)reasons.push(...population.unsupportedFilters)
  const matching=input.records.filter(record=>contextMatches(record,context,player.metricId))
  if(matching.length!==input.records.length)reasons.push('Records with a different specialization, season, metric, region, or known game partition were excluded')
  const records=eligible&&!population.unsupportedFilters.length?matching:[]
  population.sampleSize=records.length
  const now=Date.parse(context.to),future=(at:string|null)=>at!==null&&Date.parse(at)>now+300_000
  const stale=(at:string|null)=>at!==null&&now-Date.parse(at)>7*86_400_000
  const validRecords=records.filter(record=>record.value!==null&&!future(record.observedAt??record.retrievedAt))
  if(validRecords.length!==records.length)reasons.push('Missing values or future-dated observations were excluded from numerical differences')
  const playerFuture=future(player.observedAt??player.retrievedAt)
  if(playerFuture)reasons.push('Your rating observation is dated in the future')
  const isStale=stale(player.observedAt)||records.some(record=>stale(record.observedAt??record.retrievedAt))
  if(isStale)reasons.push('Some ratings are older than seven days; refresh before treating differences as current')
  if(!player.observedAt)assumptions.push('Your rating observation time is unknown')
  if(!population.observedAt&&population.retrievedAt)assumptions.push('The source retrieval time does not establish when each player was last observed')
  if(!context.partition)assumptions.push('The game patch or ranking partition is not established')
  assumptions.push('Gear and build frequencies describe this sample and do not establish best in slot or combat gains')
  if(population.fullDenominator===null)assumptions.push('The complete population size is unknown; no overall percentile is calculated')
  const comparable=eligible&&!population.unsupportedFilters.length&&!playerFuture&&!isStale
  const best=validRecords.length?Math.max(...validRecords.map(record=>record.value!)):null
  const status:ComparisonResult['status']=!comparable||!records.length?'unsupported':population.coverage!=='complete'||!player.observedAt||!context.partition?'partial':'supported'
  if(!records.length&&!population.unsupportedFilters.length)reasons.push('No comparable observations are available for this selection')
  return {schemaVersion:1,status,context,player,population,records,providerRank:player.rank!==null&&player.rankScope?{rank:player.rank,scope:player.rankScope,population:player.population}:null,percentile:null,gapToSampleBest:comparable&&best!==null?best-player.value!:null,reasons,assumptions,evidenceRefs:[...player.evidenceRefs,...records.flatMap(record=>record.evidenceRefs)],gearDifferences:[],builds:[],reportReview:{state:'unconfigured',reason:'Warcraft Logs report links are saved locally; authenticated report summaries and event review are not configured'},evaluatedAt:context.to}
}
