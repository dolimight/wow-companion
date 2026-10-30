import { afterEach,describe,expect,it } from 'vite-plus/test'
import { DatabaseRepository } from '../../workers/database/repository'
import type { DatabaseClient } from '../database'
import type { Activity,Character } from '../../shared/domain'
import type { TopPlayers } from '../../shared/top-players'
import { createComparisonService } from './service'
const at='2026-10-29T12:00:00Z',databases:DatabaseRepository[]=[]
const rating={value:2000,label:'Mythic+ score',seasonId:'season-2',observedAt:at,source:'Raider.IO',rank:100,rankScope:'World · overall',population:null,sourceUrl:'https://raider.io/characters/us/one/you'}
const top=(extra:Partial<TopPlayers>={}):TopPlayers=>({season:{slug:'season-2',name:'Season 2'},specId:62,specName:'Arcane',className:'Mage',region:'us',observedAt:at,runsScanned:0,source:'Raider.IO spec rankings',population:'Two sampled Arcane Mages',players:[{name:'Leader',realm:'One',region:'us',score:3000,keyLevel:20,dungeon:null,url:'https://raider.io/characters/us/one/leader',loadout:'talents-one'},{name:'Second',realm:'One',region:'us',score:2900,keyLevel:19,dungeon:null,url:'https://raider.io/characters/us/one/second',loadout:null}],builds:[{loadout:'talents-one',count:1,players:['Leader']}],gearPlayers:2,averageItemLevel:100,slots:{head:{items:[{id:42,name:'Helm',count:1}],enchants:[],gems:[]}},...extra})
function setup(fetcher:()=>Promise<TopPlayers>=async()=>top()){
  const repo=new DatabaseRepository(':memory:');databases.push(repo)
  const db={call:async(method:string,...args:unknown[])=>Reflect.apply((repo as unknown as Record<string,Function>)[method]!,repo,args)} as unknown as Pick<DatabaseClient,'call'>
  const character=repo.addCharacter({name:'You',region:'us',realm:'One',className:'Mage',specId:62,specName:'Arcane',ratings:{mythicPlus:rating,raiding:null,pvp:null}})
  const service=createComparisonService({db,insights:{topPlayers:fetcher},now:()=>new Date(at)})
  return {repo,db,character,service}
}
const input=(character:Character,activity:Activity='mythicPlus')=>({characterId:character.id,activity,population:'peers' as const,region:'us' as const})
afterEach(()=>{for(const db of databases.splice(0))db.close()})
describe('comparison service boundaries',()=>{
  it('returns scoped leader values with truthful sample time, frequencies and native rank',async()=>{
    const {service,character}=setup(),result=await service.evaluate({...input(character),population:'leaders'})
    expect(result.records).toHaveLength(2);expect(result.gapToSampleBest).toBe(1000);expect(result.percentile).toBeNull()
    expect(result.population).toMatchObject({sampleSize:2,observedAt:null,retrievedAt:at,fullDenominator:null})
    expect(result.gearDifferences[0]).toMatchObject({count:1,sampleSize:2,kind:'sample-frequency'})
    expect(result.records[0]?.rank).toBeNull()
    expect(result.providerRank?.scope).toBe('World · overall')
  })
  it('does not compare a top-run score with the player seasonal score',async()=>{
    const {service,character}=setup(async()=>top({source:'Raider.IO top runs'})),result=await service.evaluate({...input(character),population:'leaders'})
    expect(result.status).toBe('unsupported');expect(result.records).toHaveLength(0);expect(result.gapToSampleBest).toBeNull()
    expect(result.reasons.join(' ')).toContain('run scores')
  })
  it('filters tracked peers by exact spec, season, provider metric and region',async()=>{
    const {repo,character,service}=setup()
    for(const [name,spec,season,source,region] of [['Valid',62,'season-2','Raider.IO','us'],['Other spec',63,'season-2','Raider.IO','us'],['Old season',62,'season-1','Raider.IO','us'],['Other source',62,'season-2','Blizzard','us'],['Other region',62,'season-2','Raider.IO','eu']] as const)repo.addCharacter({name,region,realm:'One',specId:spec,ratings:{mythicPlus:{...rating,seasonId:season,source},raiding:null,pvp:null}})
    expect((await service.evaluate(input(character))).records.map(entry=>entry.name)).toEqual(['Valid'])
    const unsupported=await service.evaluate({...input(character),keyLevel:10})
    expect(unsupported.records).toEqual([]);expect(unsupported.population.requestedFilters.keyLevel).toBe('10');expect(unsupported.population.actualFilters.keyLevel).toBeUndefined()
  })
  it('records changed rating observations once and keeps seasons and sources separated',async()=>{
    const {repo,character,service}=setup()
    await service.evaluate({...input(character),population:'history'});await service.evaluate({...input(character),population:'history'})
    expect((await service.evaluate({...input(character),population:'history'})).records).toHaveLength(1)
    repo.applyProviderRatings(character.id,{mythicPlus:{...rating,value:2100,observedAt:'2026-10-29T12:01:00Z'}})
    expect((await service.evaluate({...input(character),population:'history'})).records).toHaveLength(2)
    repo.applyProviderRatings(character.id,{mythicPlus:{...rating,value:2200,seasonId:'season-3',observedAt:'2026-10-29T12:02:00Z'}})
    expect((await service.evaluate({...input(character),population:'history'})).records).toHaveLength(1)
    const state=repo.getFeatureState(character.id,'comparisons') as {history:unknown[]}
    expect(state.history).toHaveLength(3)
  })
  it('retains usable cached samples on provider errors and does not convert failures to zero',async()=>{
    let fail=false
    const {service,character}=setup(async()=>{if(fail)throw new Error('Raider.IO rate limit reached; retry after 60 seconds');return top()})
    await service.evaluate({...input(character),population:'leaders'});fail=true
    const result=await service.evaluate({...input(character),population:'leaders'})
    expect(result.status).toBe('partial');expect(result.records[0]?.value).toBe(3000);expect(result.population.retrievedAt).toBe(at)
    expect(result.reasons[0]).toContain('retry after 60 seconds')
  })
  it('saves bounded report bookmarks per character without implying report contents were observed',async()=>{
    const {repo,service,character}=setup(),other=repo.addCharacter({name:'Alt',realm:'One',region:'us'})
    const report=await service.saveReport({characterId:character.id,url:'https://warcraftlogs.com/reports/AbCdEf1234567890#fight=1',notes:'Review defensive timing'})
    expect(report).toMatchObject({url:'https://www.warcraftlogs.com/reports/AbCdEf1234567890#fight=1',observedAt:null,adapterState:'unconfigured'})
    expect(await service.reports(other.id)).toEqual([])
    expect((await service.saveReport({characterId:character.id,url:report.url,notes:'Updated'})).id).toBe(report.id)
    expect(await service.reports(character.id)).toHaveLength(1)
    for(const url of ['http://www.warcraftlogs.com/reports/AbCdEf1234567890','https://evil.test/reports/AbCdEf1234567890','https://www.warcraftlogs.com/reports/short','https://user:secret@www.warcraftlogs.com/reports/AbCdEf1234567890'])await expect(service.saveReport({characterId:character.id,url,notes:''})).rejects.toThrow()
    repo.deleteCharacter(character.id);await expect(service.reports(character.id)).rejects.toThrow('not found')
  })
  it('does not resurrect a deleted character after an asynchronous provider reply',async()=>{
    let resolve!:(sample:TopPlayers)=>void,started!:()=>void
    const waiting=new Promise<void>(r=>{started=r})
    const {repo,service,character}=setup(()=>{started();return new Promise(r=>{resolve=r})})
    const pending=service.evaluate({...input(character),population:'leaders'})
    await waiting;repo.deleteCharacter(character.id);resolve(top())
    await expect(pending).rejects.toThrow('not found')
    expect(repo.exportBackup().featureStates).toEqual([])
  })
  it('rejects results when the current spec/rating changes during provider work',async()=>{
    let resolve!:(sample:TopPlayers)=>void,started!:()=>void
    const waiting=new Promise<void>(r=>{started=r})
    const {repo,service,character}=setup(()=>{started();return new Promise(r=>{resolve=r})})
    const pending=service.evaluate({...input(character),population:'leaders'})
    await waiting;repo.applyProviderRatings(character.id,{mythicPlus:{...rating,value:2222,observedAt:'2026-10-29T12:01:00Z'}});resolve(top())
    await expect(pending).rejects.toThrow('observations changed')
    expect(repo.getFeatureState(character.id,'comparisons')).toBeNull()
  })
  it('keeps raid and PvP unsupported leaders separate rather than reusing Mythic+ data',async()=>{
    let calls=0
    const {service,character}=setup(async()=>{calls++;return top()})
    for(const activity of ['raiding','pvp'] as const){const result=await service.evaluate({...input(character,activity),population:'leaders'});expect(result.status).toBe('unsupported');expect(result.records).toEqual([])}
    expect(calls).toBe(0)
  })
})
