import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Character } from '../../shared/domain'
import { logsCredentialsSchema,reportSummarySchema,type LogsStatus,type PvpBracketIndex,type ReportSummary } from '../../shared/comparisons'
import { BlizzardError,realmSlug,type BlizzardApi,type BlizzardRegion } from '../providers/blizzard'
import type { SecretStore } from '../secrets'

export class ComparisonProviderError extends Error {
  constructor(message:string,readonly status:number|null=null,readonly retryAfterMs:number|null=null){super(message);this.name='ComparisonProviderError'}
}
const finite=z.number().finite(),positive=finite.int().positive(),time=()=>new Date()
const canonical=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const regionSchema=z.enum(['us','eu'])
const pvpIndexSchema=z.object({current_season:z.object({id:positive}).nullable().optional()})
const bracketIndexSchema=z.object({season:z.object({id:positive}).optional(),leaderboards:z.array(z.object({name:z.string().max(200),key:z.object({href:z.string().url()})})).max(300)})
const pvpEntrySchema=z.object({rank:positive,rating:finite.int().nonnegative(),character:z.object({id:positive,name:z.string().min(1).max(100),realm:z.object({id:positive,slug:z.string().min(1).max(100)})})})
const pvpLeaderboardSchema=z.object({season:z.object({id:positive}),name:z.string().optional(),entries:z.array(pvpEntrySchema).max(10_000)})
export type PvpSample={seasonId:number;region:'us'|'eu';bracket:{slug:string;name:string;specId:number|null};retrievedAt:string;records:Array<{id:number;name:string;realm:string;rating:number;rank:number}>;player:{rating:number|null;rank:number|null;seasonId:number|null};publishedEntries:number;sourceUrl:string;limitations:string[]}

/** Current season and bracket paths are discovered from Blizzard indices, never inferred from expansion */
export function createPvpProvider(options:{api:()=>Promise<Pick<BlizzardApi,'get'>|null>;now?:()=>Date}){
  const clock=options.now??time,cooldowns=new Map<string,number>(),indices=new Map<string,{at:number;value:PvpBracketIndex}>()
  async function get(api:Pick<BlizzardApi,'get'>,path:string,namespace:'dynamic'|'profile',region:BlizzardRegion){
    const until=cooldowns.get(region)??0
    if(clock().getTime()<until)throw new ComparisonProviderError(`Blizzard requested a retry after ${new Date(until).toISOString()}`,429,until-clock().getTime())
    try{return await api.get(path,namespace,{region,what:'This PvP bracket',signal:AbortSignal.timeout(15_000)})}
    catch(error){if(error instanceof BlizzardError&&error.status===429){const delay=error.retryAfterMs??60_000;cooldowns.set(region,clock().getTime()+delay);throw new ComparisonProviderError(`Blizzard rate limit reached — retry after ${new Date(clock().getTime()+delay).toISOString()}`,429,delay)}throw error}
  }
  async function brackets(input:{character:Character;region:'us'|'eu'}):Promise<PvpBracketIndex>{
    const region=regionSchema.parse(input.region),api=await options.api()
    if(!api)return {configured:false,seasonId:null,region,retrievedAt:null,brackets:[]}
    const key=`${region}:${input.character.className}:${input.character.specId}`,cached=indices.get(key)
    if(cached&&clock().getTime()-cached.at<300_000)return cached.value
    const seasons=pvpIndexSchema.parse(await get(api,'/data/wow/pvp-season/index','dynamic',region))
    if(!seasons.current_season)throw new ComparisonProviderError('Blizzard has not published a current PvP season')
    const seasonId=seasons.current_season.id,index=bracketIndexSchema.parse(await get(api,`/data/wow/pvp-season/${seasonId}/pvp-leaderboard/index`,'dynamic',region))
    if(index.season&&index.season.id!==seasonId)throw new ComparisonProviderError('Blizzard returned a leaderboard index from another season')
    const specSuffix=`${realmSlug(input.character.className)}-${realmSlug(input.character.specName)}`
    const discovered=index.leaderboards.flatMap(entry=>{
      const url=new URL(entry.key.href),match=url.pathname.match(new RegExp(`^/data/wow/pvp-season/${seasonId}/pvp-leaderboard/([a-z0-9-]{1,100})$`))
      if(url.protocol!=='https:'||url.hostname!==`${region}.api.blizzard.com`||url.port||url.username||url.password||!match)return []
      const slug=match[1]!,scoped=/^(shuffle|blitz)-/.test(slug)
      if(scoped&&!slug.endsWith(`-${specSuffix}`))return []
      return [{slug,name:entry.name,specId:scoped?input.character.specId:null}]
    })
    const value:PvpBracketIndex={configured:true,seasonId,region,retrievedAt:clock().toISOString(),brackets:[...new Map(discovered.map(entry=>[entry.slug,entry])).values()]}
    indices.set(key,{at:clock().getTime(),value});if(indices.size>12)indices.delete(indices.keys().next().value!)
    return value
  }
  async function leaders(input:{character:Character;region:'us'|'eu';bracket?:string}):Promise<PvpSample>{
    const region=regionSchema.parse(input.region),api=await options.api()
    if(!api)throw new ComparisonProviderError('Connect your Blizzard API key in Settings to read the official PvP ladder')
    const index=await brackets(input),selected=input.bracket?index.brackets.find(entry=>entry.slug===input.bracket):index.brackets.find(entry=>entry.specId!==null&&entry.slug.startsWith('shuffle-'))??index.brackets.find(entry=>entry.slug==='3v3')??index.brackets[0]
    if(!selected||index.seasonId===null)throw new ComparisonProviderError('Choose a bracket published in Blizzard’s current-season index')
    const raw=pvpLeaderboardSchema.parse(await get(api,`/data/wow/pvp-season/${index.seasonId}/pvp-leaderboard/${selected.slug}`,'dynamic',region))
    if(raw.season.id!==index.seasonId)throw new ComparisonProviderError('Blizzard returned ladder entries from another PvP season')
    const limitations=['The published ladder is a bounded listing, not the complete rated-player population','Individual character observation times are not supplied by this endpoint']
    const records=raw.entries.map(entry=>({id:entry.character.id,name:entry.character.name,realm:entry.character.realm.slug,rating:entry.rating,rank:entry.rank})).sort((a,b)=>a.rank-b.rank)
    const match=raw.entries.find(entry=>canonical(entry.character.name)===canonical(input.character.name)&&canonical(entry.character.realm.slug)===canonical(input.character.realm)&&input.character.region.toLowerCase()===region)
    const player:{rating:number|null;rank:number|null;seasonId:number|null}={rating:match?.rating??null,rank:match?.rank??null,seasonId:match?index.seasonId:null}
    if(!match){
      try{
        if(!['us','eu','kr','tw'].includes(input.character.region.toLowerCase()))throw new ComparisonProviderError('Your character region is not supported by Blizzard')
        const profile=z.object({rating:finite.int().nonnegative(),season:z.object({id:positive})}).parse(await get(api,`/profile/wow/character/${encodeURIComponent(realmSlug(input.character.realm))}/${encodeURIComponent(input.character.name.toLowerCase())}/pvp-bracket/${selected.slug}`,'profile',input.character.region.toLowerCase() as BlizzardRegion))
        player.seasonId=profile.season.id
        if(profile.season.id===index.seasonId)player.rating=profile.rating
        else limitations.push('Your selected-bracket profile belongs to another season and its rating was withheld')
      }catch(error){limitations.push(error instanceof Error?error.message:'Your selected-bracket profile is unavailable')}
    }
    return {seasonId:index.seasonId,region,bracket:selected,retrievedAt:clock().toISOString(),records:records.slice(0,20),player,publishedEntries:records.length,sourceUrl:`https://worldofwarcraft.blizzard.com/en-us/game/pvp/leaderboards/${selected.slug}`,limitations}
  }
  return {brackets,leaders}
}

export function reportCode(input:string){
  const url=new URL(input)
  if(url.protocol!=='https:'||!['www.warcraftlogs.com','warcraftlogs.com'].includes(url.hostname)||url.port||url.username||url.password||!/^\/reports\/[A-Za-z0-9]{16}\/?$/.test(url.pathname))throw new ComparisonProviderError('Choose a Warcraft Logs HTTPS report link with a valid report code')
  url.hostname='www.warcraftlogs.com';return {url:url.href,code:url.pathname.split('/')[2]!}
}
const MAX_BYTES=4*1024*1024
async function boundedJson(response:Response){
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new ComparisonProviderError('Provider response exceeds the 4 MiB limit')
  const reader=response.body?.getReader();if(!reader)throw new ComparisonProviderError('The provider returned an empty response')
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BYTES)throw new ComparisonProviderError('Provider response exceeds the 4 MiB limit');chunks.push(chunk.value)}}finally{await reader.cancel().catch(()=>{})}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown}catch{throw new ComparisonProviderError('The provider returned unsupported non-JSON data')}
}
const actorSchema=z.object({id:positive.nullable(),name:z.string().max(200).nullable(),server:z.string().max(100).nullable(),type:z.string().nullable(),subType:z.string().nullable()})
const fightSchema=z.object({id:positive,encounterID:finite.int().nonnegative(),name:z.string().max(200),difficulty:finite.int().nullable(),kill:z.boolean().nullable(),inProgress:z.boolean().nullable(),startTime:finite.nonnegative(),endTime:finite.nonnegative(),friendlyPlayers:z.array(positive).max(200).nullable()})
const rawReportSchema=z.object({code:z.string().regex(/^[A-Za-z0-9]{16}$/),title:z.string().max(500),revision:finite.int().nonnegative(),startTime:finite.nonnegative(),endTime:finite.nonnegative(),visibility:z.string(),region:z.object({slug:z.string()}).nullable(),masterData:z.object({gameVersion:finite.int().nullable(),actors:z.array(actorSchema).max(2000).nullable()}).nullable(),fights:z.array(fightSchema).max(1000).nullable()})
const responseSchema=z.object({errors:z.array(z.object({message:z.string().optional(),extensions:z.object({code:z.union([z.string(),z.number()]).optional()}).optional()})).optional(),data:z.object({reportData:z.object({report:rawReportSchema.nullable()}).nullable().optional(),rateLimitData:z.object({limitPerHour:finite.int().nonnegative(),pointsSpentThisHour:finite.nonnegative(),pointsResetIn:finite.int().nonnegative()}).nullable().optional()}).nullable().optional()})
export const REPORT_SUMMARY_QUERY=`query CompanionReportSummary($code: String!) {
  reportData { report(code: $code, allowUnlisted: false) {
    code title revision startTime endTime visibility region { slug }
    masterData { gameVersion actors(type: "Player") { id name server type subType } }
    fights { id encounterID name difficulty kill inProgress startTime endTime friendlyPlayers }
  } }
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
}`

/** User-owned OAuth credentials, fixed public endpoint, and a fixed read-only summary query */
export function createLogsProvider(options:{secrets:SecretStore;now?:()=>Date;fetcher?:typeof fetch}){
  const clock=options.now??time,fetcher=options.fetcher??fetch
  let generation=0,retryAt=0,token:{value:string;expiresAt:number;key:string}|null=null
  const inflight=new Map<string,Promise<ReportSummary>>()
  const credentials=async()=>{const raw=await options.secrets.get('warcraftlogs-client');if(!raw)return null;try{return logsCredentialsSchema.parse(JSON.parse(raw))}catch{return null}}
  const allowed=()=>{if(clock().getTime()<retryAt)throw new ComparisonProviderError(`Warcraft Logs requested a retry after ${new Date(retryAt).toISOString()}`,429,retryAt-clock().getTime())}
  async function request(url:string,init:RequestInit){
    allowed()
    const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(20_000)})
    if(!response.ok){
      if(response.status===429){const raw=response.headers.get('retry-after'),seconds=raw!==null?Number(raw):NaN,until=Number.isFinite(seconds)?clock().getTime()+Math.max(0,seconds)*1000:raw?Date.parse(raw):NaN;retryAt=Number.isFinite(until)?until:clock().getTime()+60_000;throw new ComparisonProviderError(`Warcraft Logs rate limit reached — retry after ${new Date(retryAt).toISOString()}`,429,retryAt-clock().getTime())}
      throw new ComparisonProviderError(response.status===401?'Warcraft Logs did not accept these credentials':response.status===403?'Warcraft Logs denied this request or blocked API access':response.status===404?'The public Warcraft Logs report is unavailable or private':`Warcraft Logs request failed (${response.status})`,response.status)
    }
    return boundedJson(response)
  }
  async function access(value:z.infer<typeof logsCredentialsSchema>){
    const key=digest(value)
    if(token&&token.key===key&&token.expiresAt>clock().getTime()+60_000)return token.value
    const data=z.object({access_token:z.string().min(1).max(20_000),expires_in:finite.positive()}).parse(await request('https://www.warcraftlogs.com/oauth/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${value.clientId}:${value.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials'}).toString()}))
    token={value:data.access_token,key,expiresAt:clock().getTime()+data.expires_in*1000};return token.value
  }
  async function status():Promise<LogsStatus>{const value=await credentials();return {configured:!!value,persistent:options.secrets.persistent,clientIdHint:value?`…${value.clientId.slice(-4)}`:null,retryAt:retryAt>clock().getTime()?new Date(retryAt).toISOString():null}}
  async function configure(raw:z.input<typeof logsCredentialsSchema>){const value=logsCredentialsSchema.parse(raw);await access(value);await options.secrets.set('warcraftlogs-client',JSON.stringify(value));generation++;return status()}
  async function clear(){generation++;token=null;inflight.clear();await options.secrets.delete('warcraftlogs-client');return status()}
  async function fetchReport(input:{character:Character;url:string}):Promise<ReportSummary>{
    const target=reportCode(input.url),key=`${input.character.id}:${target.code}:${generation}`,existing=inflight.get(key)
    if(existing)return existing
    const task=(async()=>{
      const currentGeneration=generation,value=await credentials()
      if(!value)throw new ComparisonProviderError('Connect your Warcraft Logs API credentials in Settings first')
      const bearer=await access(value)
      const response=responseSchema.parse(await request('https://www.warcraftlogs.com/api/v2/client',{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:REPORT_SUMMARY_QUERY,variables:{code:target.code}})}))
      if(currentGeneration!==generation)throw new ComparisonProviderError('Warcraft Logs credentials changed during the request')
      const quota=response.data?.rateLimitData
      if(quota&&quota.pointsSpentThisHour>=quota.limitPerHour)retryAt=clock().getTime()+quota.pointsResetIn*1000
      if(response.errors?.length){const denied=response.errors.some(error=>/forbidden|private|permission|unauth/i.test(error.message??'')||['FORBIDDEN','UNAUTHENTICATED',401,403].includes(error.extensions?.code??''));throw new ComparisonProviderError(denied?'This report is private, unavailable, or not permitted by the public API':'Warcraft Logs rejected part of the summary query; partial data was not imported',denied?403:null)}
      const report=response.data?.reportData?.report
      if(!report)throw new ComparisonProviderError('The public report was not found or is private',404)
      if(report.code!==target.code||report.visibility!=='public')throw new ComparisonProviderError('Only the explicitly requested public report can be imported')
      if(report.endTime<report.startTime||report.endTime>clock().getTime()+300_000)throw new ComparisonProviderError('The report has incompatible observation timestamps')
      if(report.masterData?.gameVersion!=null&&report.masterData.gameVersion!==1)throw new ComparisonProviderError('This report is not from Retail WoW')
      const region=report.region?.slug?.toLowerCase()??null,actors=(report.masterData?.actors??[]).filter(actor=>actor.type==='Player'&&actor.name&&actor.server&&canonical(actor.name)===canonical(input.character.name)&&canonical(actor.server)===canonical(input.character.realm))
      const actorMatch:ReportSummary['actorMatch']=!region?'region-unknown':region!==input.character.region.toLowerCase()?'different-region':actors.length>1?'ambiguous':actors.length===1&&actors[0]!.id!==null?'matched':'not-found'
      const actor=actorMatch==='matched'?actors[0]!:null
      const limitations=['This summary does not contain combat events, damage/healing rankings, or defensive timing judgments','A report game version does not establish the current seasonal ruleset or ranking partition']
      if(actorMatch!=='matched')limitations.push('The selected character could not be uniquely matched by region, name, and realm')
      const fights=(report.fights??[]).map(fight=>{
        if(fight.endTime<fight.startTime||fight.endTime>report.endTime-report.startTime+5000)throw new ComparisonProviderError('The report has incompatible fight boundaries')
        return {id:fight.id,encounterId:fight.encounterID,name:fight.name,difficulty:fight.difficulty,kill:fight.kill,inProgress:fight.inProgress,startOffsetMs:fight.startTime,endOffsetMs:fight.endTime,participated:actor?.id!=null&&fight.friendlyPlayers!==null?fight.friendlyPlayers.includes(actor.id):null}
      })
      const complete=actorMatch==='matched'&&report.masterData?.gameVersion===1&&report.fights!==null&&fights.every(fight=>fight.participated!==null&&fight.kill!==null&&fight.inProgress!==true)
      return reportSummarySchema.parse({schemaVersion:1,adapterVersion:'wcl-summary-v1',code:report.code,url:target.url,title:report.title,revision:report.revision,startAt:new Date(report.startTime).toISOString(),endAt:new Date(report.endTime).toISOString(),retrievedAt:clock().toISOString(),region,visibility:'public',gameVersion:report.masterData?.gameVersion??null,actorMatch,actorId:actor?.id??null,actorName:actor?.name??null,fights,coverage:complete?'complete':'partial',limitations})
    })()
    inflight.set(key,task)
    try{return await task}finally{if(inflight.get(key)===task)inflight.delete(key)}
  }
  return {status,configure,clear,fetchReport,revision:()=>generation}
}
