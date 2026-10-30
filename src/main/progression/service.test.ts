import { afterEach,describe,expect,it } from 'vite-plus/test'
import { characterSchema } from '../../shared/domain'
import { progressionInput,progressionContext } from '../../../fixtures/progression'
import { DatabaseRepository } from '../../workers/database/repository'
import type { DatabaseClient } from '../database'
import { createProgressionService,loadBundledProgressionRules } from './service'

const databases:DatabaseRepository[]=[]
afterEach(()=>{for(const db of databases.splice(0))db.close()})
function fixture(){
  const db=new DatabaseRepository(':memory:');databases.push(db)
  const input=progressionInput()
  const character=db.addCharacter({name:'Progression fixture',region:'us',realm:'Fixture',className:'Death Knight',specName:'Blood',specId:250,level:90,itemLevel:100,gameBuild:progressionContext.gameBuild,gearObservedAt:'2026-10-27T10:00:00.000Z',gearCoverage:'complete',gear:input.baseline.items.map(item=>({...item,classId:item.classId??undefined,subclassId:item.subclassId??undefined,variantCoverage:'complete',upgradeTrackId:item.slot==='head'?'fixture-track':null,upgradeRank:item.slot==='head'?1:null})),progressionResources:{currencies:{crests:10},highWaterMarks:{},discountCoverage:'complete',observedAt:'2026-10-27T10:00:00.000Z'}})
  const bridge={call:async(method:keyof DatabaseRepository,...args:unknown[])=>(db[method] as (...args:unknown[])=>unknown).apply(db,args)} as Pick<DatabaseClient,'call'>
  const service=createProgressionService({db:bridge,items:async()=>[],installedBuild:()=>progressionContext.gameBuild,now:()=>new Date(progressionContext.now),rules:()=>({catalog:{schemaVersion:1,rulesets:[input.ruleset]},candidates:{'fixture-rules':[]}})})
  return {db,input,character,bridge,service}
}
describe('progression service',()=>{
  it('ships build-pinned client references without claiming exhaustive seasonal coverage',()=>{
    const bundle=loadBundledProgressionRules()
    expect(bundle.catalog.rulesets).toHaveLength(1)
    expect(bundle.catalog.rulesets[0]?.candidateCoverage).toBe('partial')
    expect(bundle.catalog.rulesets[0]?.constraintsCoverage).toBe('partial')
    expect(Object.values(bundle.candidates)[0]!.length).toBeGreaterThan(0)
  })
  it('evaluates a source-validated fixture without mutating observed gear or the personal target',async()=>{
    const {db,character,service}=fixture()
    const before=db.getCharacter(character.id)
    const result=await service.evaluate(character.id,'mythicPlus')
    expect(result.equipped.itemLevel).toBe(100)
    expect(result.ownedUpgrade.itemLevel).toBe(101.25)
    expect(result.affordable.itemLevel).toBe(100.625)
    expect(result.affordable.costs).toEqual([{currencyId:'crests',balance:10,spent:10,remaining:0}])
    expect(result.ruleset?.id).toBe('fixture-rules')
    expect(db.getCharacter(character.id)).toEqual(before)
    expect(result.evidenceRefs.length).toBeGreaterThan(0)
  })
  it('preserves observed item level and per-slot evidence without supported rules',async()=>{
    const {character,bridge}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>{throw new Error('Index unavailable')},installedBuild:()=>null,now:()=>new Date(progressionContext.now)})
    const result=await service.evaluate(character.id,'mythicPlus')
    expect(result.equipped.itemLevel).toBe(100);expect(result.legalMaximum.itemLevel).toBeNull()
    expect(result.slots.find(slot=>slot.slot==='head')?.current?.name).toBe('Fixture head')
    expect(result.unresolved.some(reason=>reason.includes('No uniquely validated ruleset'))).toBe(true)
  })
  it('keeps activity preferences isolated, validates them, and rejects deleted characters',async()=>{
    const {db,character,service}=fixture()
    await service.saveContentPreferences(character.id,'mythicPlus',{activities:['mythicPlus'],difficulties:['mythic'],allowCrafting:false,excludedMethods:['vault']})
    expect((await service.getContentPreferences(character.id,'mythicPlus')).allowCrafting).toBe(false)
    expect((await service.getContentPreferences(character.id,'raiding')).allowCrafting).toBe(true)
    db.deleteCharacter(character.id)
    await expect(service.evaluate(character.id,'mythicPlus')).rejects.toThrow('not found')
  })
  it('withholds spending claims for stale resources while keeping owned upgrade information',async()=>{
    const {character,bridge,input}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>[],installedBuild:()=>progressionContext.gameBuild,now:()=>new Date('2026-10-29T12:00:00.000Z'),rules:()=>({catalog:{schemaVersion:1,rulesets:[input.ruleset]},candidates:{}})})
    const result=await service.evaluate(character.id,'mythicPlus')
    expect(result.ownedUpgrade.itemLevel).toBe(101.25)
    expect(result.affordable.itemLevel).toBeNull()
    expect(result.unresolved.some(reason=>reason.includes('Currency observations are stale'))).toBe(true)
  })
  it('rejects a result if the character is deleted during an asynchronous metadata read',async()=>{
    const {db,character,bridge}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>{db.deleteCharacter(character.id);return []},installedBuild:()=>null})
    await expect(service.evaluate(character.id,'mythicPlus')).rejects.toThrow('not found')
  })
  it.each(['12.0.0.1',null])('withholds verified caps for a stale or unavailable index (%s)',async metadataBuild=>{
    const {character,bridge,input}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>[],installedBuild:()=>progressionContext.gameBuild,metadataBuild:()=>metadataBuild,now:()=>new Date(progressionContext.now),rules:()=>({catalog:{schemaVersion:1,rulesets:[input.ruleset]},candidates:{}})})
    const result=await service.evaluate(character.id,'mythicPlus')
    expect(result.equipped.itemLevel).toBe(100)
    for(const key of ['ownedUpgrade','contentScoped','legalMaximum','affordable'] as const){expect(result[key].itemLevel).toBeNull();expect(result[key].status).not.toBe('supported')}
  })
  it('rejects a spending result if balances change during an asynchronous metadata read',async()=>{
    const {db,character,bridge,input}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>{const backup=db.exportBackup();db.importBackup({...backup,characters:backup.characters.map(value=>({...value,progressionResources:{currencies:{crests:0},highWaterMarks:{},discountCoverage:'complete',observedAt:'2026-10-27T11:00:00.000Z'}}))});return []},installedBuild:()=>progressionContext.gameBuild,now:()=>new Date(progressionContext.now),rules:()=>({catalog:{schemaVersion:1,rulesets:[input.ruleset]},candidates:{}})})
    await expect(service.evaluate(character.id,'mythicPlus')).rejects.toThrow('changed during progression')
  })
  it('rejects an asynchronous result if content preferences change during evaluation',async()=>{
    const {db,character,bridge,input}=fixture()
    const service=createProgressionService({db:bridge,items:async()=>[],installedBuild:()=>progressionContext.gameBuild,now:()=>new Date(progressionContext.now),evaluator:async value=>{db.setContentPreferences(character.id,'mythicPlus',{activities:[],difficulties:[],allowCrafting:false,excludedMethods:[]});return (await import('../../shared/progression-evaluation')).evaluateProgression(value)},rules:()=>({catalog:{schemaVersion:1,rulesets:[input.ruleset]},candidates:{}})})
    await expect(service.evaluate(character.id,'mythicPlus')).rejects.toThrow('changed during progression')
  })
  it('normalizes legacy character progression fields as optional, preserving old imports',()=>{
    const character=characterSchema.parse({id:'old',name:'Old',region:'us',realm:'Old'})
    expect(character.progressionResources).toBeUndefined()
  })
})
