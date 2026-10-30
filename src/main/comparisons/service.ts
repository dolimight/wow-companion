import { createHash,randomUUID } from 'node:crypto'
import { z } from 'zod'
import { activitySchema,type Activity,type Character } from '../../shared/domain'
import { evidenceRefSchema } from '../../shared/evidence'
import { comparePopulation,comparisonInputSchema,reportInputSchema,type ComparisonContext,type ComparisonInput,type ComparisonRecord,type ComparisonReport,type PopulationDescriptor } from '../../shared/comparisons'
import type { DatabaseClient } from '../database'
import type { Insights } from '../insights'
import type { TopPlayers } from '../../shared/top-players'
import {createPvpProvider,createLogsProvider} from './providers'
import {MemorySecretStore,type SecretStore} from '../secrets'
import type {BlizzardApi} from '../providers/blizzard'
import {reportSummarySchema} from '../../shared/comparisons'

const at=z.string().datetime(),nullableText=z.string().nullable()
const recordSchema=z.object({id:z.string(),name:z.string(),realm:z.string(),region:z.string(),metricId:z.string(),metricName:z.string(),unit:z.string(),value:z.number().finite().nonnegative().nullable(),activity:activitySchema,specId:z.number().int().positive().nullable(),seasonId:nullableText,partition:nullableText,observedAt:at.nullable(),retrievedAt:at.nullable(),source:z.string(),sourceUrl:z.string().url().nullable(),rank:z.number().int().positive().nullable(),rankScope:nullableText,population:z.number().int().positive().nullable(),evidenceRefs:z.array(evidenceRefSchema)})
const reportSchema=z.object({id:z.string(),url:z.string().url(),notes:z.string().max(2000),createdAt:at,updatedAt:at,observedAt:z.null(),adapterState:z.enum(['unconfigured','summary'])})
const leaderPlayerSchema=z.object({name:z.string().max(100),realm:z.string().max(100),region:z.string().max(20),score:z.number().finite().nonnegative().nullable(),keyLevel:z.number().int().nullable(),dungeon:z.string().nullable(),url:z.string().url(),loadout:z.string().max(400).nullable()})
const leaderSampleSchema=z.object({season:z.object({slug:z.string(),name:z.string()}),specId:z.number().int().positive(),specName:z.string(),className:z.string(),region:z.enum(['us','eu','world']),observedAt:at,source:z.string(),population:z.string(),players:z.array(leaderPlayerSchema).max(100),gearPlayers:z.number().int().nonnegative(),slots:z.array(z.object({slot:z.string(),itemId:z.number().int().positive(),name:z.string().max(200),count:z.number().int().nonnegative()})).max(100),builds:z.array(z.object({loadout:z.string().max(400),count:z.number().int().nonnegative()})).max(20)})
type LeaderSample=z.infer<typeof leaderSampleSchema>
const stateSchema=z.object({schemaVersion:z.literal(1),history:z.array(recordSchema).max(500),reports:z.array(reportSchema).max(100),leaders:z.array(leaderSampleSchema).max(6)})
type State=z.infer<typeof stateSchema>
const empty=():State=>({schemaVersion:1,history:[],reports:[],leaders:[]})
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sig=(c:Character,activity:Activity)=>hash([c.id,c.specId,c.ratings[activity],c.gear,c.talents,c.demo,c.archived])
const sameIdentity=(a:Character,b:Character)=>a.id===b.id

function metric(character:Character,activity:Activity):ComparisonRecord {
  const rating=character.ratings[activity],source=rating?.source??'Unknown source',label=rating?.label??`${activity} rating`
  const id=activity==='mythicPlus'&&/raider\.?io/i.test(source)&&/score/i.test(label)?'raiderio:mythic-plus-score':`${source.toLowerCase()}:${activity}:${label.toLowerCase()}:${rating?.rankScope??''}`
  const identity=[character.id,activity,character.specId,rating?.seasonId??null,id,rating?.value??null,rating?.observedAt??null,rating?.rank??null,rating?.rankScope??null]
  const contentHash=hash(identity)
  return {id:contentHash,name:character.name,realm:character.realm,region:character.region.toLowerCase(),activity,specId:character.specId,seasonId:rating?.seasonId??null,partition:null,metricId:id,metricName:label,unit:activity==='mythicPlus'?'score':activity==='pvp'?'rating':'provider metric',value:rating?.value??null,observedAt:rating?.observedAt??null,retrievedAt:null,source,sourceUrl:rating?.sourceUrl??null,rank:rating?.rank??null,rankScope:rating?.rankScope??null,population:rating?.population??null,evidenceRefs:[{id:`${character.id}:${activity}:rating:${contentHash}`,contentHash}]}
}
function safeReportUrl(input:string){
  const url=new URL(input)
  if(url.protocol!=='https:'||!['www.warcraftlogs.com','warcraftlogs.com'].includes(url.hostname)||url.port||url.username||url.password||!/^\/reports\/[A-Za-z0-9]{16}\/?$/.test(url.pathname))throw new Error('Choose a Warcraft Logs HTTPS report link with a valid report code')
  url.hostname='www.warcraftlogs.com';return url.href
}
function toSample(top:TopPlayers):LeaderSample {
  return leaderSampleSchema.parse({...top,slots:Object.entries(top.slots).flatMap(([slot,value])=>(value?.items??[]).map(item=>({slot,itemId:item.id,name:item.name,count:item.count}))),builds:top.builds.map(build=>({loadout:build.loadout,count:build.count}))})
}

export function createComparisonService(options:{db:Pick<DatabaseClient,'call'>;insights:Pick<Insights,'topPlayers'>;now?:()=>Date;blizzardApi?:()=>Promise<BlizzardApi|null>;secrets?:SecretStore}){
  const pvp=createPvpProvider({api:options.blizzardApi??(async()=>null),now:options.now})
  const logs=createLogsProvider({secrets:options.secrets??new MemorySecretStore(),now:options.now})
  const queues=new Map<string,Promise<unknown>>()
  const now=()=>options.now?.()??new Date()
  async function character(id:string){const c=await options.db.call('getCharacter',id);if(!c)throw new Error('Character was not found');return c}
  async function state(id:string){await character(id);const raw=await options.db.call('getFeatureState',id,'comparisons');return raw===null?empty():stateSchema.parse(raw)}
  function serial<T>(id:string,fn:()=>Promise<T>):Promise<T>{
    const task=(queues.get(id)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(id,task)
    return task.finally(()=>{if(queues.get(id)===task)queues.delete(id)})
  }
  async function update(id:string,fn:(s:State)=>void){return serial(id,async()=>{const current=await state(id);fn(current);await options.db.call('saveFeatureState',id,'comparisons',stateSchema.parse(current));return current})}
  async function reports(characterId:string):Promise<ComparisonReport[]>{return (await state(characterId)).reports}
  async function saveReport(raw:z.input<typeof reportInputSchema>):Promise<ComparisonReport>{
    const input=reportInputSchema.parse(raw),url=safeReportUrl(input.url),time=now().toISOString()
    let saved:ComparisonReport|undefined
    await update(input.characterId,current=>{
      const existing=current.reports.find(report=>report.url===url)
      saved={id:existing?.id??randomUUID(),url,notes:input.notes,createdAt:existing?.createdAt??time,updatedAt:time,observedAt:null,adapterState:'unconfigured'}
      current.reports=[saved,...current.reports.filter(report=>report.id!==saved!.id)].slice(0,100)
    })
    return saved!
  }
  async function evaluate(raw:ComparisonInput){
    const input=comparisonInputSchema.parse(raw),current=await character(input.characterId),before=sig(current,input.activity),time=now().toISOString(),player=metric(current,input.activity)
    if(input.activity==='pvp'&&input.population==='leaders'&&input.region!=='world'&&!!options.blizzardApi){
      const region=input.region??(current.region==='eu'?'eu':'us'),sample=await pvp.leaders({character:current,region,bracket:input.pvpBracket})
      if(sig(await character(current.id),input.activity)!==before)throw Error('Character observations changed during comparison')
      const metricId=`blizzard:pvp:${sample.bracket.slug}`,scope=`${region.toUpperCase()} ${sample.bracket.name}`,seasonId=String(sample.seasonId),specId=sample.bracket.specId
      const own={...player,specId,seasonId,metricId,metricName:sample.bracket.name,unit:'rating',value:sample.player.seasonId===sample.seasonId?sample.player.rating:null,rank:sample.player.rank,rankScope:scope,source:'Blizzard',sourceUrl:sample.sourceUrl,observedAt:null,retrievedAt:sample.retrievedAt}
      return comparePopulation({context:{activity:'pvp',specId,role:null,region,seasonId,partition:null,encounter:null,difficulty:null,keyLevel:null,gearBracket:null,from:null,to:time},player:own,population:{provider:'Blizzard',selectionMethod:'pvp-bracket',label:scope,sampleSize:sample.records.length,fullDenominator:null,coverage:'partial',sourceUrl:sample.sourceUrl,observedAt:null,retrievedAt:sample.retrievedAt,requestedFilters:{bracket:sample.bracket.slug,region},actualFilters:{bracket:sample.bracket.slug,region,spec:specId===null?'All specializations in this bracket':String(specId)},unsupportedFilters:[...(input.encounter||input.difficulty||input.keyLevel?['Content filters are unavailable for this bracket']:[]),...sample.limitations]},records:sample.records.map(row=>({...own,id:String(row.id),name:row.name,realm:row.realm,value:row.rating,rank:row.rank,evidenceRefs:[]}))})
    }
    const region=input.region??(current.region==='eu'?'eu':current.region==='us'?'us':'world')
    const context:ComparisonContext={activity:input.activity,specId:current.specId,role:null,region,seasonId:player.seasonId,partition:null,encounter:input.encounter||null,difficulty:input.difficulty||null,keyLevel:input.keyLevel??null,gearBracket:null,from:null,to:time}
    const unsupported:string[]=[]
    if(input.keyLevel!=null)unsupported.push(`Key-level +${input.keyLevel} filtering is unavailable for aggregate seasonal ratings`)
    if(input.encounter?.trim())unsupported.push(`Encounter filtering for ${input.encounter} needs a verified report adapter`)
    if(input.difficulty?.trim())unsupported.push(`Difficulty filtering for ${input.difficulty} needs a verified content-specific metric`)
    if(input.reportUrl){safeReportUrl(input.reportUrl);unsupported.push('A report link alone does not provide authenticated encounter or event data')}
    let population:PopulationDescriptor={provider:input.population==='leaders'?'Raider.IO':'Companion local observations',selectionMethod:input.population==='leaders'?'spec-leaderboard':input.population==='peers'?'tracked-roster':'character-history',label:input.population==='leaders'?'Public specialization leaders':input.population==='peers'?'Tracked characters with the same specialization, season, and metric':'Your recorded rating history',sampleSize:0,fullDenominator:null,coverage:'partial',sourceUrl:input.population==='leaders'?'https://raider.io/mythic-plus-spec-rankings':null,observedAt:null,retrievedAt:null,requestedFilters:{activity:input.activity,spec:String(current.specId??'unknown'),season:player.seasonId??'unknown',region,...(input.keyLevel!=null?{keyLevel:String(input.keyLevel)}:{}),...(input.encounter?{encounter:input.encounter}:{}),...(input.difficulty?{difficulty:input.difficulty}:{})},actualFilters:{activity:input.activity,spec:String(current.specId??'unknown'),season:player.seasonId??'unknown',region},unsupportedFilters:unsupported}
    let records:ComparisonRecord[]=[],sample:LeaderSample|undefined,sourceError:string|undefined
    const saved=await state(current.id)
    if(input.population==='leaders'){
      if(input.activity!=='mythicPlus')unsupported.push('Public raid and PvP leader adapters are not configured; this view does not reuse Mythic+ rankings')
      else if(current.demo)unsupported.push('Demo characters do not query live player rankings')
      else if(current.specId===null||current.className==='Unknown'||current.specName==='Unknown')unsupported.push('A known class and specialization are needed for public leaders')
      else if(!unsupported.length){
        try{sample=toSample(await options.insights.topPlayers({specId:current.specId,specName:current.specName,className:current.className,region}))}
        catch(error){sourceError=error instanceof Error?error.message:'The public ranking provider is unavailable';sample=saved.leaders.find(entry=>entry.specId===current.specId&&entry.region===region&&entry.season.slug===player.seasonId)}
        if(sample){
          if(sample.specId!==current.specId||sample.region!==region)throw new Error('The ranking provider returned a different specialization or region')
          const seasonScores=sample.source==='Raider.IO spec rankings'
          population={...population,provider:sample.source,selectionMethod:seasonScores?'spec-leaderboard':'top-run-sample',label:sample.population,retrievedAt:sample.observedAt,observedAt:null}
          records=sample.players.map((entry,index)=>{
            const metricId=seasonScores?'raiderio:mythic-plus-score':'raiderio:individual-run-score',contentHash=hash([sample!.season.slug,current.specId,entry.url,metricId,entry.score,sample!.observedAt])
            return {id:`leader:${index}:${contentHash}`,name:entry.name,realm:entry.realm,region:entry.region.toLowerCase(),activity:'mythicPlus',specId:sample!.specId,seasonId:sample!.season.slug,partition:null,metricId,metricName:seasonScores?'Mythic+ score':'Individual run score',unit:'score',value:entry.score,observedAt:null,retrievedAt:sample!.observedAt,source:sample!.source,sourceUrl:entry.url,rank:null,rankScope:null,population:null,evidenceRefs:[{id:`raiderio:sample:${contentHash}`,contentHash}]}
          })
          if(!seasonScores)unsupported.push('The provider returned sampled run scores, which cannot be compared with your seasonal character score')
        }
      }
    }else if(input.population==='peers'){
      records=(await options.db.call('listCharacters',false)).filter(entry=>entry.id!==current.id&&!entry.demo&&!entry.archived).map(entry=>metric(entry,input.activity))
      population.actualFilters.population='Tracked roster only'
    }else{
      records=saved.history.filter(entry=>entry.activity===input.activity)
      population.actualFilters.character=current.id
    }
    const latest=await character(current.id)
    if(!sameIdentity(latest,current)||sig(latest,input.activity)!==before)throw new Error('Character observations changed during comparison — refresh to use the latest data')
    const next=await update(current.id,stored=>{
      if(current.ratings[input.activity]&&!stored.history.some(entry=>entry.id===player.id))stored.history=[...stored.history,player].slice(-500)
      if(sample&&!sourceError)stored.leaders=[sample,...stored.leaders.filter(entry=>entry.specId!==sample!.specId||entry.region!==sample!.region)].slice(0,6)
    })
    if(input.population==='history')records=next.history.filter(entry=>entry.activity===input.activity)
    const finalCharacter=await character(current.id)
    if(sig(finalCharacter,input.activity)!==before)throw new Error('Character observations changed during comparison — refresh to use the latest data')
    const result=comparePopulation({context,player,population,records})
    if(sourceError){result.status=result.records.length?'partial':'unsupported';result.reasons.unshift(`${sourceError.replace(/\.+\s*$/,'')} — saved source data is retained`)}
    if(sample&&!unsupported.length&&sample.season.slug===context.seasonId){
      const slotsFor=(group:string)=>group==='rings'?['finger1','finger2']:group==='trinkets'?['trinket1','trinket2']:[group]
      result.gearDifferences=sample.slots.map(entry=>({...entry,count:entry.count,sampleSize:sample!.gearPlayers,equipped:current.gear.some(item=>slotsFor(entry.slot).includes(item.slot)&&item.itemId===entry.itemId),kind:'sample-frequency' as const,sourceUrl:population.sourceUrl}))
      result.builds=sample.builds.map(entry=>({...entry,sampleSize:sample!.players.length,equipped:current.talents?.loadout===entry.loadout}))
    }
    return result
  }
  return {evaluate,saveReport,reports,
    pvpBrackets:async(input:{characterId:string;region:'us'|'eu'})=>pvp.brackets({character:await character(input.characterId),region:input.region}),
    configureLogs:logs.configure,clearLogs:logs.clear,logsStatus:logs.status,
    async reportSummary(input:{characterId:string;url:string}){const current=await character(input.characterId),summary=await logs.fetchReport({character:current,url:input.url});if(sig(await character(current.id),'raiding')!==sig(current,'raiding'))throw Error('Character changed during report import');const old=await options.db.call('getFeatureState',current.id,'report-summaries');const summaries=z.array(reportSummarySchema).max(100).parse(old??[]);await options.db.call('saveFeatureState',current.id,'report-summaries',[summary,...summaries.filter(s=>s.url!==summary.url)].slice(0,100));return summary},
  }
}
export type ComparisonService=ReturnType<typeof createComparisonService>
