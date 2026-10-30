import { z } from 'zod'
import { weekStart } from '../../shared/weekly'
import type { ProviderExtras } from '../../workers/database/repository'
import { gearItemSchema, specializationIdSchema, type ActivityRating, type AddCharacterInput, type Character, type GearItem } from '../../shared/domain'

const positiveRank = z.number().int().nonnegative().nullable().optional()
const rankGroup = z.object({ world: positiveRank, region: positiveRank, realm: positiveRank })
const itemSchema = z.object({item_id:z.number().int().positive(),item_level:z.number().nonnegative().nullable().optional(),name:z.string().nullable().optional(),enchant:z.number().int().nullable().optional(),gems:z.array(z.object({item_id:z.number().int().optional()})).nullable().optional()})
const profileSchema = z.object({
  name:z.string().min(1),realm:z.string().min(1),region:z.enum(['us','eu','kr','tw','cn']),class:z.string(),race:z.string(),active_spec_name:z.string().optional(),active_spec_id:z.number().int().optional(),profile_url:z.string().url(),last_crawled_at:z.string().nullable().optional(),
  gear:z.object({item_level_equipped:z.number().nonnegative().optional(),items:z.record(z.string(),z.unknown()).optional()}).nullable().optional(),
  mythic_plus_scores_by_season:z.array(z.object({season:z.string(),scores:z.object({all:z.number().nonnegative()})})).nullable().optional(),
  mythic_plus_ranks:z.object({overall:rankGroup.optional(),class:rankGroup.optional()}).nullable().optional(),
  mythic_plus_weekly_highest_level_runs:z.array(z.object({dungeon:z.string(),mythic_level:z.number().int().nonnegative(),completed_at:z.string().optional(),num_keystone_upgrades:z.number().int().optional()})).nullable().optional(),
  talentLoadout:z.object({loadout_text:z.string().min(1).max(400),loadout_spec_id:z.number().int().optional()}).nullable().optional(),
  raid_progression:z.record(z.string(),z.object({summary:z.string(),total_bosses:z.number().int().nonnegative().optional(),normal_bosses_killed:z.number().int().nonnegative().optional(),heroic_bosses_killed:z.number().int().nonnegative().optional(),mythic_bosses_killed:z.number().int().nonnegative().optional()})).nullable().optional(),
})
export type RaiderIoLookup={region:'us'|'eu'|'kr'|'tw'|'cn';realm:string;name:string}
export type RaiderIoProfile={character:AddCharacterInput;ratings:Partial<Character['ratings']>;sourceUrl:string;observedAt:string|null;extras:ProviderExtras}
const slots:Record<string,GearItem['slot']>={head:'head',helm:'head',neck:'neck',shoulder:'shoulder',back:'back',chest:'chest',wrist:'wrist',hands:'hands',waist:'waist',legs:'legs',feet:'feet',finger1:'finger1',finger2:'finger2',trinket1:'trinket1',trinket2:'trinket2',mainhand:'mainHand',offhand:'offHand'}
function parseTime(value:string|null|undefined) {if(!value)return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null}
export function parseRaiderIoProfile(input:unknown):RaiderIoProfile {
  const data=profileSchema.parse(input)
  const url=new URL(data.profile_url);if(url.protocol!=='https:'||url.hostname!=='raider.io')throw new Error('Provider returned an unexpected profile URL')
  const observedAt=parseTime(data.last_crawled_at)
  const base={rank:null,population:null,seasonId:null,observedAt,source:'Raider.IO',sourceUrl:url.href,rankScope:null}
  const season=data.mythic_plus_scores_by_season?.[0]
  const mythicPlus:ActivityRating|null=season?{...base,value:season.scores.all,label:'Mythic+ score',rank:data.mythic_plus_ranks?.overall?.world||null,rankScope:'World · overall',seasonId:season.season}:null
  // Each raid keeps its own kill summary; kill counts are never treated as a parse percentile
  const raids=Object.entries(data.raid_progression??{}).map(([slug,raid])=>`${slug}: ${raid.summary}`)
  const raiding:ActivityRating|null=raids.length?{...base,value:null,label:raids.join(' · ').slice(0,120)}:null
  const gear=Object.entries(data.gear?.items??{}).flatMap(([key,raw])=>{const parsed=itemSchema.safeParse(raw);if(!slots[key]||!parsed.success)return [];const item=parsed.data;return [gearItemSchema.parse({slot:slots[key],itemId:item.item_id,name:item.name??`Item ${item.item_id}`,itemLevel:item.item_level??null,enchant:item.enchant?`Enchant #${item.enchant}`:null,enchantCoverage:item.enchant!=null?'complete':'unknown',gemsCoverage:item.gems!=null?'complete':'unknown',gems:(item.gems??[]).map(gem=>gem.item_id?`Gem #${gem.item_id}`:'Unknown gem')})]})
  // Weekly runs belong to the reset week in which Raider.IO crawled them, never the week they were fetched
  const crawled=observedAt?Date.parse(observedAt):null
  const week=crawled!=null?weekStart(data.region,crawled):null
  const weekly=week!=null&&data.mythic_plus_weekly_highest_level_runs?{source:'Raider.IO' as const,observedAt:observedAt!,weekStart:new Date(week).toISOString(),runs:data.mythic_plus_weekly_highest_level_runs.filter(run=>!run.completed_at||Date.parse(run.completed_at)>=week).map(run=>({dungeon:run.dungeon,level:run.mythic_level,timed:run.num_keystone_upgrades!=null?run.num_keystone_upgrades>0:null,completedAt:parseTime(run.completed_at)}))}:null
  const specId=specializationIdSchema.parse(data.active_spec_id??null)
  const talents=data.talentLoadout?{loadout:data.talentLoadout.loadout_text,specId:specializationIdSchema.parse(data.talentLoadout.loadout_spec_id??null)??specId,source:'Raider.IO',observedAt}:null
  return {extras:{weekly,talents},sourceUrl:url.href,observedAt,ratings:{mythicPlus,raiding},character:{edition:'retail',region:data.region,realm:data.realm,name:data.name,className:data.class,specName:data.active_spec_name??'Unknown',specId,raceName:data.race,observedAt,itemLevel:data.gear?.item_level_equipped??null,gear,gearCoverage:'partial',gearSource:'Raider.IO',gearSourceUrl:url.href,gearObservedAt:observedAt,customizationCoverage:'unknown',maxItemLevel:null,targetItemLevel:null,sourceRefs:[{provider:'manual',edition:'retail',region:data.region,realmId:data.realm,characterKey:data.name}],ratings:{mythicPlus,raiding,pvp:null}}}
}
export class RaiderIoError extends Error {constructor(message:string,public readonly retryAfterMs:number|null=null){super(message);this.name='RaiderIoError'}}
/** Fixed HTTPS origin, no provider cookies/tokens, redirects disallowed */
export async function fetchRaiderIoProfile(input:RaiderIoLookup,signal?:AbortSignal):Promise<RaiderIoProfile> {
  const lookup=z.object({region:z.enum(['us','eu','kr','tw','cn']),realm:z.string().min(1).max(100),name:z.string().min(1).max(100)}).parse(input)
  const url=new URL('https://raider.io/api/v1/characters/profile')
  url.search=new URLSearchParams({...lookup,fields:'gear,talents,mythic_plus_scores_by_season:current,mythic_plus_ranks,raid_progression,mythic_plus_weekly_highest_level_runs'}).toString()
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:requestSignal,redirect:'error'})
  if(!response.ok){const retry=Number(response.headers.get('retry-after'));throw new RaiderIoError(response.status===429?'Raider.IO rate limit reached':response.status===400||response.status===404?'Character is unavailable or private on Raider.IO':`Raider.IO request failed (${response.status})`,response.status===429&&Number.isFinite(retry)&&retry>0?retry*1000:null)}
  const max=2*1024*1024;const reader=response.body?.getReader();if(!reader)throw new RaiderIoError('Provider returned an empty response');const chunks:Uint8Array[]=[];let size=0
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new RaiderIoError('Provider response exceeds the 2 MiB limit');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  const profile=parseRaiderIoProfile(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
  if(profile.character.region!==lookup.region||normalized(profile.character.name)!==normalized(lookup.name)||normalized(profile.character.realm)!==normalized(lookup.realm))throw new RaiderIoError('Provider returned another character')
  return profile
}

