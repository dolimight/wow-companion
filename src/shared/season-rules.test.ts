import { describe,expect,it } from 'vite-plus/test'
import { progressionContext,progressionRules } from '../../fixtures/progression'
import { resolveSeasonRuleset,seasonRulesCatalogSchema,seasonRulesetSchema } from './season-rules'

describe('dated season rules',()=>{
  it('accepts an empty catalog without inventing a ruleset',()=>{expect(resolveSeasonRuleset(seasonRulesCatalogSchema.parse({schemaVersion:1,rulesets:[]}),progressionContext)).toBeNull()})
  it('resolves one source-validated ruleset for the supported build, season, region and date',()=>{const rules=progressionRules();expect(resolveSeasonRuleset({schemaVersion:1,rulesets:[rules]},progressionContext)?.id).toBe(rules.id)})
  it.each([
    {effectiveFrom:'2026-11-01T00:00:00.000Z'},
    {effectiveUntil:'2026-10-27T12:00:00.000Z'},
    {status:'announced' as const},
    {status:'retired' as const},
    {validated:false},
    {sources:[]},
    {validationFixtures:[]},
    {sources:[{title:'Future check',url:'https://example.com/future',checkedAt:'2026-10-28T00:00:00.000Z'}]},
    {regions:['eu']},
  ])('rejects unavailable or unvalidated rules %j',patch=>{expect(resolveSeasonRuleset({schemaVersion:1,rulesets:[{...progressionRules(),...patch}]},progressionContext)).toBeNull()})
  it('does not reuse rules for an unknown build, different season or overlapping active catalog',()=>{
    const rules=progressionRules();const catalog={schemaVersion:1 as const,rulesets:[rules]}
    expect(resolveSeasonRuleset(catalog,{...progressionContext,gameBuild:null})).toBeNull()
    expect(resolveSeasonRuleset(catalog,{...progressionContext,gameBuild:'12.1.6.70449'})).toBeNull()
    expect(resolveSeasonRuleset(catalog,{...progressionContext,seasonId:'another-season'})).toBeNull()
    expect(resolveSeasonRuleset({...catalog,rulesets:[rules,{...rules,id:'overlap'}]},progressionContext)).toBeNull()
  })
  it('rejects reversed effective/build ranges and ambiguous upgrade ranks',()=>{
    expect(seasonRulesetSchema.safeParse({...progressionRules(),builds:{min:'12.2',max:'12.1'}}).success).toBe(false)
    expect(seasonRulesetSchema.safeParse({...progressionRules(),effectiveUntil:'2026-09-01T00:00:00.000Z'}).success).toBe(false)
    expect(seasonRulesetSchema.safeParse({...progressionRules(),upgradeTracks:[{id:'a',name:'a',ranks:[{rank:1,itemLevel:100,cost:[]},{rank:1,itemLevel:110,cost:[]}]}]}).success).toBe(false)
  })
})
