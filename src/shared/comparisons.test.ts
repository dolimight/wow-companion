import { describe,expect,it } from 'vite-plus/test'
import { comparePopulation,type ComparisonContext,type ComparisonRecord,type PopulationDescriptor } from './comparisons'
const now='2026-10-29T12:00:00Z'
const context:ComparisonContext={activity:'mythicPlus',specId:62,role:null,region:'us',seasonId:'season-2',partition:'12.1.5',encounter:null,difficulty:null,keyLevel:null,gearBracket:null,from:null,to:now}
const record=(extra:Partial<ComparisonRecord>={}):ComparisonRecord=>({id:'one',name:'Player',realm:'One',region:'us',metricId:'raiderio:mythic-plus-score',metricName:'Mythic+ score',unit:'score',value:2000,activity:'mythicPlus',specId:62,seasonId:'season-2',partition:'12.1.5',observedAt:now,retrievedAt:null,source:'Raider.IO',sourceUrl:null,rank:100,rankScope:'World · overall',population:null,evidenceRefs:[],...extra})
const population:PopulationDescriptor={provider:'Raider.IO',selectionMethod:'spec-leaderboard',label:'Twenty observed leaders',sampleSize:20,fullDenominator:null,coverage:'partial',sourceUrl:null,observedAt:null,retrievedAt:now,requestedFilters:{},actualFilters:{},unsupportedFilters:[]}
describe('contextual sample comparisons',()=>{
  it('never invents an overall percentile from twenty leaders or rewrites provider rank scope',()=>{
    const result=comparePopulation({context,player:record(),population,records:Array.from({length:20},(_,index)=>record({id:String(index),value:3000+index,rank:null}))})
    expect(result.population.sampleSize).toBe(20)
    expect(result.percentile).toBeNull()
    expect(result.providerRank).toEqual({rank:100,scope:'World · overall',population:null})
    expect(result.gapToSampleBest).toBe(1019)
    expect(result.status).toBe('partial')
  })
  it('excludes different season, specialization, metric, activity, region, and patch',()=>{
    const incompatible=[{seasonId:'season-1'},{specId:63},{metricId:'run-score'},{activity:'pvp' as const},{region:'eu'},{partition:'12.1.0'}]
    const result=comparePopulation({context,player:record(),population,records:[record({id:'valid'}),...incompatible.map((entry,index)=>record({id:String(index),...entry}))]})
    expect(result.records.map(entry=>entry.id)).toEqual(['valid'])
  })
  it('does not silently broaden unsupported encounter filters',()=>{
    const result=comparePopulation({context:{...context,encounter:'Boss'},player:record(),population:{...population,unsupportedFilters:['Encounter adapter is unavailable']},records:[record()]})
    expect(result.status).toBe('unsupported');expect(result.records).toEqual([]);expect(result.gapToSampleBest).toBeNull()
  })
  it('keeps source retrieval time distinct from unknown actual observation time',()=>{
    const result=comparePopulation({context,player:record(),population,records:[record({observedAt:null,retrievedAt:now})]})
    expect(result.population.observedAt).toBeNull()
    expect(result.records[0]?.observedAt).toBeNull()
    expect(result.assumptions.join(' ')).toContain('retrieval time does not establish')
  })
  it('withholds current gaps for old or future player observations and unknown seasons',()=>{
    for(const player of [record({observedAt:'2026-10-01T12:00:00Z'}),record({observedAt:'2026-11-01T12:00:00Z'})]){
      const result=comparePopulation({context,player,population,records:[record()]})
      expect(result.status).toBe('unsupported');expect(result.gapToSampleBest).toBeNull()
    }
    expect(comparePopulation({context:{...context,seasonId:null},player:record({seasonId:null}),population,records:[record({seasonId:null})]}).status).toBe('unsupported')
  })
  it('retains observed zero without substituting it for a missing rating',()=>{
    expect(comparePopulation({context,player:record({value:0}),population,records:[record({value:1})]}).gapToSampleBest).toBe(1)
    expect(comparePopulation({context,player:record({value:null}),population,records:[record()]}).gapToSampleBest).toBeNull()
  })
})
