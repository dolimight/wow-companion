import {describe,it,expect} from 'vite-plus/test'
import {loadBundledProgressionRules} from './service'
import {rulesetRejectionReasons} from '../../shared/season-rules'
import evidence from '../../../data/season-rules/client-evidence.json'
describe('installed Retail seasonal reference',()=>{
  it('pins real tracks and base costs to source-hashed client tables',()=>{
    const rules=loadBundledProgressionRules().catalog.rulesets[0]!
    expect(rules.builds).toEqual({min:'12.1.5.70688',max:'12.1.5.70783'})
    expect(rules.upgradeTracks.map(t=>[t.name,t.ranks[0]!.itemLevel,t.ranks.at(-1)!.itemLevel])).toEqual([['Adventurer',266,282],['Veteran',279,295],['Champion',292,308],['Hero',305,321],['Myth',318,334]])
    expect(rules.upgradeTracks.map(t=>t.ranks[1]!.cost?.[0])).toEqual([3442,3443,3444,3445,3446].map(id=>({currencyId:String(id),amount:20})))
    expect(Object.values(evidence.tableHashes).every(hash=>/^[a-f0-9]{64}$/.test(hash))).toBe(true)
  })
  it('stays on for reviewed builds without a weekly expiry, and turns off for a build nobody reviewed',()=>{
    const rules=loadBundledProgressionRules().catalog.rulesets[0]!
    expect(rules.effectiveUntil).toBeNull()
    const context=(gameBuild:string)=>({now:'2027-01-15T00:00:00.000Z',gameBuild,seasonId:'midnight-season-2',rulesetId:null,region:'us'}) as Parameters<typeof rulesetRejectionReasons>[1]
    expect(rulesetRejectionReasons(rules,context('12.1.5.70783'))).toEqual([])
    expect(rulesetRejectionReasons(rules,context('12.1.5.70688'))).toEqual([])
    expect(rulesetRejectionReasons(rules,context('12.1.7.71000'))).toContain('The installed game build is not supported by these rules')
  })
  it('keeps server-conditional rewards and special upgrades explicitly incomplete',()=>{
    const {catalog,candidates}=loadBundledProgressionRules(),rules=catalog.rulesets[0]!
    expect(rules.candidateCoverage).toBe('partial');expect(rules.constraintsCoverage).toBe('partial')
    const references=candidates[rules.id]!
    expect(references.length).toBeGreaterThan(100)
    expect(references.every(item=>!item.owned&&item.coverage==='partial'&&item.currencyCost===null)).toBe(true)
    expect(evidence.limitations.join(' ')).toContain('Venomstone')
  })
})
