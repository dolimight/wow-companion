import {describe,it,expect} from 'vite-plus/test'
import {loadBundledProgressionRules} from './service'
import evidence from '../../../data/season-rules/client-evidence.json'
describe('installed Retail seasonal reference',()=>{
  it('pins real tracks and base costs to source-hashed client tables',()=>{
    const rules=loadBundledProgressionRules().catalog.rulesets[0]!
    expect(rules.builds).toEqual({min:'12.1.5.70575',max:'12.1.5.70575'})
    expect(rules.upgradeTracks.map(t=>[t.name,t.ranks[0]!.itemLevel,t.ranks.at(-1)!.itemLevel])).toEqual([['Adventurer',266,282],['Veteran',279,295],['Champion',292,308],['Hero',305,321],['Myth',318,334]])
    expect(rules.upgradeTracks.map(t=>t.ranks[1]!.cost?.[0])).toEqual([3442,3443,3444,3445,3446].map(id=>({currencyId:String(id),amount:20})))
    expect(Object.values(evidence.tableHashes).every(hash=>/^[a-f0-9]{64}$/.test(hash))).toBe(true)
    expect(rules.effectiveUntil).not.toBeNull()
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
