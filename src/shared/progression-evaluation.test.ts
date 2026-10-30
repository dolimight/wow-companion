import { describe,expect,it } from 'vite-plus/test'
import { progressionInput,progressionItem } from '../../fixtures/progression'
import { evaluateProgression } from './progression-evaluation'
import { validateGearSet } from './gear-set-validation'

describe('explainable legal progression',()=>{
  it('produces a proved sixteen-slot weighted two-hand ceiling with source and selected items',()=>{
    const input=progressionInput();input.baseline.items=input.baseline.items.map(item=>item.slot==='mainHand'?{...item,itemLevel:180}:item)
    const result=evaluateProgression({...input,baseline:{...input.baseline,equippedItemLevel:null}})
    expect(result.equipped.itemLevel).toBe(110)
    expect(result.legalMaximum).toMatchObject({status:'supported',itemLevel:110,searchComplete:true})
    expect(result.legalMaximum.items).toHaveLength(15)
    expect(result.ruleset?.sources[0]?.url).toBe('https://example.com/fixture')
  })
  it('weights dual weapons once each and never guesses an unsupported weapon configuration',()=>{
    const input=progressionInput();input.baseline={...input.baseline,specId:251,weaponConfiguration:'dual',equippedItemLevel:null,items:[...input.baseline.items.map(item=>item.slot==='mainHand'?{...item,inventoryType:13,subclassId:7,itemLevel:120}:item),progressionItem('offHand',140)]}
    expect(evaluateProgression(input).legalMaximum.itemLevel).toBe(103.75)
    input.baseline.items=input.baseline.items.filter(item=>item.slot!=='offHand').map(item=>item.slot==='mainHand'?{...item,inventoryType:null}:item)
    input.baseline.weaponConfiguration='unknown'
    expect(evaluateProgression(input).legalMaximum.itemLevel).toBeNull()
  })
  it('uses both Fury two-hand weapons once each without reusing the same owned instance',()=>{
    const input=progressionInput();input.baseline={...input.baseline,className:'Warrior',specId:72,weaponConfiguration:'dual',equippedItemLevel:null,items:[...input.baseline.items.map(item=>item.slot==='mainHand'?{...item,itemLevel:120}:item),progressionItem('offHand',140,{inventoryType:17,subclassId:8})]}
    const result=evaluateProgression(input)
    expect(result.legalMaximum.itemLevel).toBe(103.75)
    expect(new Set(result.legalMaximum.items.flatMap(item=>item.instanceId?[item.instanceId]:[])).size).toBe(16)
  })
  it('keeps the observed level while unsupported or future rules leave all ceilings unknown',()=>{
    const input=progressionInput()
    for(const ruleset of [null,{...input.ruleset,effectiveFrom:'2026-11-01T00:00:00.000Z'}]){
      const result=evaluateProgression({...input,ruleset})
      expect(result.equipped.itemLevel).toBe(100)
      for(const key of ['ownedUpgrade','contentScoped','legalMaximum','affordable'] as const)expect(result[key]).toMatchObject({status:'unsupported',itemLevel:null})
    }
  })
  it('enforces unique and crafted limits across the complete set rather than independent slots',()=>{
    const input=progressionInput()
    input.ruleset.restrictions=[{group:'crafted',maxEquipped:1}]
    input.candidates=[progressionItem('head',200,{owned:false,instanceId:null,restrictionGroups:['crafted']}),progressionItem('chest',200,{owned:false,instanceId:null,restrictionGroups:['crafted']}),progressionItem('finger1',180,{owned:false,instanceId:null,uniqueGroups:['unique-ring']})]
    const result=evaluateProgression(input)
    expect(result.legalMaximum.status).toBe('supported')
    expect(result.legalMaximum.items.filter(item=>item.restrictionGroups.includes('crafted'))).toHaveLength(1)
    expect(result.legalMaximum.items.filter(item=>item.uniqueGroups.includes('unique-ring'))).toHaveLength(1)
  })
  it('shares currency across slots and identifies individual upgrade cost and remaining balances',()=>{
    const input=progressionInput();input.inventory.currencies={crests:10}
    input.baseline.items=input.baseline.items.map(item=>['head','chest'].includes(item.slot)?{...item,upgradeTrackId:'fixture-track',upgradeRank:1}:item)
    const result=evaluateProgression(input)
    expect(result.ownedUpgrade.itemLevel).toBe(102.5)
    expect(result.affordable.itemLevel).toBe(100.625)
    expect(result.affordable.costs).toEqual([{currencyId:'crests',balance:10,spent:10,remaining:0}])
    expect(result.affordable.items.filter(item=>item.itemLevel===110)).toHaveLength(1)
  })
  it('withholds affordable maxima when balances or required discounts are unknown',()=>{
    const input=progressionInput();input.inventory.currencies=null;input.inventory.discountCoverage='unknown'
    input.baseline.items=input.baseline.items.map(item=>item.slot==='head'?{...item,upgradeTrackId:'fixture-track',upgradeRank:1}:item)
    input.ruleset.upgradeTracks[0]!.ranks[1]!.discountRequired=true
    const result=evaluateProgression(input)
    expect(result.affordable.itemLevel).toBeNull();expect(result.affordable.status).toBe('partial')
    expect(result.unresolved.join(' ')).toMatch(/discount|balance/)
    expect(result.ownedUpgrade.itemLevel).toBe(101.25)
  })
  it('applies known free lower ranks before charging for higher upgrade steps',()=>{
    const input=progressionInput();input.inventory.currencies={crests:10};input.inventory.highWaterMarks={head:110}
    input.baseline.items=input.baseline.items.map(item=>item.slot==='head'?{...item,upgradeTrackId:'fixture-track',upgradeRank:1}:item)
    const result=evaluateProgression(input)
    expect(result.affordable.itemLevel).toBe(101.25);expect(result.affordable.costs[0]?.spent).toBe(10)
  })
  it('keeps selected content preferences independent of the global legal maximum',()=>{
    const input=progressionInput()
    input.candidates=[progressionItem('head',200,{owned:false,instanceId:null,source:{activity:'raiding',difficulty:'Mythic',method:'raid-drop',name:'Fixture boss',url:null}})]
    input.preferences={activities:['mythicPlus'],difficulties:[],allowCrafting:false,excludedMethods:[]}
    const result=evaluateProgression(input)
    expect(result.contentScoped.itemLevel).toBe(100);expect(result.legalMaximum.itemLevel).toBe(106.25)
  })
  it('matches difficulty names case-insensitively and leaves unknown difficulty scoped ceilings partial',()=>{
    const input=progressionInput()
    input.preferences.difficulties=['mythic']
    input.candidates=[progressionItem('head',200,{owned:false,instanceId:null,source:{activity:'raiding',difficulty:'Mythic',method:'raid-drop',name:'Fixture boss',url:null}})]
    expect(evaluateProgression(input).contentScoped.itemLevel).toBe(106.25)
    input.candidates[0]!.source!.difficulty=null
    expect(evaluateProgression(input).contentScoped).toMatchObject({status:'partial',itemLevel:null,bestKnownItemLevel:100})
    expect(evaluateProgression(input).legalMaximum.itemLevel).toBe(106.25)
  })
  it('does not turn unknown inventory type into a proved incompatibility or an unsupported cap',()=>{
    const input=progressionInput()
    input.baseline.items=input.baseline.items.map(item=>({...item,inventoryType:null}))
    const result=evaluateProgression(input)
    expect(result.legalMaximum.itemLevel).toBeNull()
    expect(result.legalMaximum.status).toBe('partial')
    expect(result.legalMaximum.bestKnownItemLevel).toBe(100)
  })
  it('does not publish future drops, incomplete catalogs, unknown candidate levels, or an interrupted search as proved maxima',()=>{
    const input=progressionInput();input.candidates=[progressionItem('head',300,{owned:false,availableFrom:'2026-11-01T00:00:00.000Z'})]
    expect(evaluateProgression(input).legalMaximum.itemLevel).toBe(100)
    expect(evaluateProgression({...input,stateBudget:1}).legalMaximum).toMatchObject({status:'unsupported',itemLevel:null,searchComplete:false})
    expect(evaluateProgression({...input,ruleset:{...input.ruleset,candidateCoverage:'partial'}}).legalMaximum).toMatchObject({status:'partial',itemLevel:null,bestKnownItemLevel:100})
    expect(evaluateProgression({...input,candidates:[progressionItem('head',100,{itemLevel:null})]}).legalMaximum.itemLevel).toBeNull()
  })
  it('rejects conflicting instances and class-incompatible choices',()=>{
    const input=progressionInput();const set=[...input.baseline.items]
    set[0]={...set[0]!,allowableClassMask:1}
    expect(validateGearSet(set,input.ruleset,input.baseline).status).toBe('invalid')
    set[0]={...input.baseline.items[0]!,instanceId:input.baseline.items[1]!.instanceId}
    expect(validateGearSet(set,input.ruleset,input.baseline).status).toBe('invalid')
  })
  it('does not combine an inventory from another character',()=>{
    const input=progressionInput();input.inventory.characterId='someone-else'
    expect(evaluateProgression(input).ownedUpgrade).toMatchObject({status:'unsupported',itemLevel:null})
  })
})
