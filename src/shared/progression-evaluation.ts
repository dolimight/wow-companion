import { gearSlotSchema, type GearSlot } from './domain'
import type { EvaluationContext, EvidenceRef } from './evidence'
import { combineEvidence, type CurrencyCost, type GearBaseline, type InventorySnapshot, type ItemVariant } from './gear-variants'
import { asCompatibilityItem, inferWeaponConfiguration, progressionArmorSlots, validateGearSet } from './gear-set-validation'
import { getItemCompatibility } from './item-compatibility'
import { averageEquippedItemLevel } from './progression'
import {quoteUpgradeVariants} from './observed-upgrades'
import { rulesetRejectionReasons, type ContentPreferences, type SeasonRuleset } from './season-rules'

export type CurrencyLedger={currencyId:string;balance:number|null;spent:number;remaining:number|null}
export type ProgressionView={status:'supported'|'partial'|'unsupported';itemLevel:number|null;bestKnownItemLevel:number|null;items:ItemVariant[];costs:CurrencyLedger[];reasons:string[];evidenceRefs:EvidenceRef[];searchComplete:boolean}
export type SlotProgression={slot:GearSlot;current:ItemVariant|null;ownedUpgrade:ItemVariant|null;contentScoped:ItemVariant|null;legalMaximum:ItemVariant|null;affordable:ItemVariant|null;reasons:string[];evidenceRefs:EvidenceRef[]}
export type ProgressionResult={schemaVersion:1;characterId:string;equipped:ProgressionView;ownedUpgrade:ProgressionView;contentScoped:ProgressionView;legalMaximum:ProgressionView;affordable:ProgressionView;slots:SlotProgression[];ruleset:Pick<SeasonRuleset,'id'|'name'|'seasonId'|'effectiveFrom'|'effectiveUntil'|'sources'>|null;preferences:ContentPreferences;evidenceRefs:EvidenceRef[];assumptions:string[];unresolved:string[];seasonReference?:{tracks:SeasonRuleset['upgradeTracks'];candidateCount:number;candidateCoverage:SeasonRuleset['candidateCoverage'];constraintsCoverage:SeasonRuleset['constraintsCoverage'];limitations:string[]}}
type Input={baseline:GearBaseline;inventory:InventorySnapshot;candidates:ItemVariant[];ruleset:SeasonRuleset|null;preferences:ContentPreferences;context:EvaluationContext;stateBudget?:number}
const unique=(values:string[])=>[...new Set(values)]
function costsByCurrency(costs:CurrencyCost[]):Record<string,number>{const total:Record<string,number>={};for(const cost of costs)total[cost.currencyId]=(total[cost.currencyId]??0)+cost.amount;return total}
function available(item:ItemVariant,now:number){return (!item.availableFrom||Date.parse(item.availableFrom)<=now)&&(!item.availableUntil||Date.parse(item.availableUntil)>now)}
function allowsSource(item:ItemVariant,preferences:ContentPreferences){
  if(item.owned)return true
  const source=item.source
  if(!source)return false
  if(source.activity==='crafting'&&!preferences.allowCrafting)return false
  if(source.activity!=='crafting'&&source.activity!=='world'&&!preferences.activities.includes(source.activity))return false
  const difficultyApplies=source.activity!=='crafting'&&source.activity!=='world'
  return (!difficultyApplies||!preferences.difficulties.length||(source.difficulty!==null&&preferences.difficulties.some(value=>value.toLowerCase()===source.difficulty!.toLowerCase())))&&!preferences.excludedMethods.includes(source.method)
}
function upgradeVariants(items:ItemVariant[],rules:SeasonRuleset,inventory:InventorySnapshot,context:EvaluationContext):{items:ItemVariant[];reasons:string[]} {
  const output:ItemVariant[]=[],reasons:string[]=[]
  for(const item of items){
    if(item.observedUpgrade){const quoted=quoteUpgradeVariants(item,context);output.push(...quoted.items);reasons.push(...quoted.reasons);continue}
    if(!item.upgradeTrackId){if(item.coverage!=='complete')reasons.push(`The upgrade track for ${item.slot} is unknown`);continue}
    const track=rules.upgradeTracks.find(track=>track.id===item.upgradeTrackId)
    if(!track||item.upgradeRank===null){reasons.push(`The upgrade track or current rank for ${item.slot} is not covered`);continue}
    const currentRank=track.ranks.find(rank=>rank.rank===item.upgradeRank)
    if(!currentRank||currentRank.itemLevel!==item.itemLevel){reasons.push(`The observed level and rank for ${item.slot} do not match this ruleset`);continue}
    for(const rank of track.ranks.filter(rank=>rank.rank>item.upgradeRank!).sort((a,b)=>a.rank-b.rank)){
      const steps=track.ranks.filter(step=>step.rank>item.upgradeRank!&&step.rank<=rank.rank)
      const ranksComplete=steps.length===rank.rank-item.upgradeRank
      const discountRequired=steps.some(step=>step.discountRequired)
      const highWater=inventory.discountCoverage==='complete'?inventory.highWaterMarks?.[item.slot]:undefined
      const free=highWater!=null&&rank.itemLevel<=highWater
      const known=ranksComplete&&steps.every(step=>step.cost!==null)&&(!discountRequired||(inventory.discountCoverage==='complete'&&highWater!==undefined))
      const cost=free?[]:known?Object.entries(costsByCurrency(steps.flatMap(step=>highWater!=null&&step.itemLevel<=highWater?[]:step.cost!))).map(([currencyId,amount])=>({currencyId,amount})):null
      if(cost===null)reasons.push(`The upgrade cost or discount for ${item.slot} is unknown`)
      output.push({...item,variantKey:`${item.variantKey}:upgrade:${rank.rank}`,upgradeRank:rank.rank,itemLevel:rank.itemLevel,currencyCost:cost})
    }
  }
  return {items:output,reasons:unique(reasons)}
}
function slotCandidates(items:ItemVariant[],baseline:GearBaseline):ItemVariant[] {
  const context={className:baseline.className,specId:baseline.specId,level:baseline.level}
  const result:ItemVariant[]=[]
  for(const item of items){
    let possible:GearSlot[]=[item.slot]
    if(item.inventoryType===11)possible=['finger1','finger2']
    else if(item.inventoryType===12)possible=['trinket1','trinket2']
    else if(item.inventoryType===13||item.inventoryType===17)possible=['mainHand','offHand']
    for(const slot of possible){
      const copy={...item,slot,instanceId:item.instanceId??(item.owned?`owned:${item.variantKey.replace(/:upgrade:\d+$/,'')}`:null)}
      if(item.inventoryType!==null&&!getItemCompatibility(asCompatibilityItem(copy),context,{slot}).compatible)continue
      result.push(copy)
    }
  }
  return [...new Map(result.map(item=>[`${item.slot}:${item.variantKey}`,item])).values()]
}
function exceedsPartialLimits(items:ItemVariant[],rules:SeasonRuleset){
  const instances=new Set<string>(),uniques=new Set<string>(),groups=new Map<string,number>()
  for(const item of items){
    if(item.instanceId&&instances.has(item.instanceId))return true
    if(item.instanceId)instances.add(item.instanceId)
    for(const group of item.uniqueGroups){if(uniques.has(group))return true;uniques.add(group)}
    for(const group of item.restrictionGroups)groups.set(group,(groups.get(group)??0)+1)
  }
  return rules.restrictions.some(rule=>(groups.get(rule.group)??0)>rule.maxEquipped)
}
function solve(input:{items:ItemVariant[];baseline:GearBaseline;rules:SeasonRuleset;inventory:InventorySnapshot;budget:number;affordable:boolean;reasons:string[]}):ProgressionView {
  const {baseline,rules,inventory}=input
  const candidates=slotCandidates(input.items,baseline)
  const bySlot=new Map(gearSlotSchema.options.map(slot=>[slot,candidates.filter(item=>item.slot===slot&&item.itemLevel!==null).sort((a,b)=>b.itemLevel!-a.itemLevel!||a.variantKey.localeCompare(b.variantKey))]))
  const required=[...progressionArmorSlots,'mainHand'] as GearSlot[]
  const missing=required.filter(slot=>!bySlot.get(slot)?.length)
  const reasons=[...input.reasons,...missing.map(slot=>`No observed compatible candidate for ${slot}`)]
  let states=0,exhausted=false,best:ItemVariant[]|null=null,bestLevel=-Infinity,bestUnknowns:string[]=[],bestCost:Record<string,number>={}
  let unknownCost=false
  const iterate=(index:number,selected:ItemVariant[],spent:Record<string,number>,weighted:number)=>{
    if(exhausted)return
    if(++states>input.budget){exhausted=true;return}
    const remaining=required.slice(index).reduce((sum,slot)=>sum+(bySlot.get(slot)?.[0]?.itemLevel??0),0)
    const maxWeapon=Math.max(bySlot.get('mainHand')?.[0]?.itemLevel??0,bySlot.get('offHand')?.[0]?.itemLevel??0)
    if(best&&weighted+remaining+maxWeapon<bestLevel*16)return
    if(index<required.length){
      const slot=required[index]!
      for(const item of bySlot.get(slot)??[]){
        const next=[...selected,item]
        if(exceedsPartialLimits(next,rules))continue
        const cost=item.currencyCost===null?null:costsByCurrency(item.currencyCost)
        if(input.affordable&&cost===null){unknownCost=true;continue}
        const nextSpent={...spent}
        let fits=true
        if(input.affordable&&cost)for(const [currency,amount]of Object.entries(cost)){
          nextSpent[currency]=(nextSpent[currency]??0)+amount
          const balance=inventory.currencies?.[currency]
          if(amount>0&&balance===undefined){unknownCost=true;fits=false}
          else if(nextSpent[currency]>(balance??0))fits=false
        }
        if(fits)iterate(index+1,next,nextSpent,weighted+item.itemLevel!)
      }
      return
    }
    const main=selected.find(item=>item.slot==='mainHand')!
    const twoHand=main.inventoryType===17||main.inventoryType===15||(main.inventoryType===26&&main.subclassId!==19)||(main.inventoryType===null&&baseline.weaponConfiguration==='twoHand')
    const choices:(ItemVariant|null)[]=twoHand&&baseline.specId!==72?[null]:[]
    if(!twoHand||baseline.specId===72)choices.push(...(bySlot.get('offHand')??[]))
    for(const off of choices){
      if(++states>input.budget){exhausted=true;break}
      const full=off?[...selected,off]:selected
      if(exceedsPartialLimits(full,rules))continue
      const cost=off?(off.currencyCost===null?null:costsByCurrency(off.currencyCost)):{}
      if(input.affordable&&cost===null){unknownCost=true;continue}
      const nextSpent={...spent};let fits=true
      if(input.affordable&&cost)for(const [currency,amount]of Object.entries(cost)){
        nextSpent[currency]=(nextSpent[currency]??0)+amount
        const balance=inventory.currencies?.[currency]
        if(amount>0&&balance===undefined){unknownCost=true;fits=false}
        else if(nextSpent[currency]>(balance??0))fits=false
      }
      if(!fits)continue
      const validation=validateGearSet(full,rules,baseline)
      if(validation.status==='invalid')continue
      const level=averageEquippedItemLevel(full,validation.weaponConfiguration)
      if(level!==null&&(level>bestLevel||(level===bestLevel&&validation.unknowns.length<bestUnknowns.length))){bestLevel=level;best=full;bestUnknowns=validation.unknowns;bestCost=nextSpent}
    }
  }
  if(!missing.length)iterate(0,[],{},0)
  if(exhausted)reasons.push('The legal-set search reached its limit before proving a maximum')
  if(unknownCost)reasons.push('Some upgrade costs or currency balances are unknown')
  if(!best)reasons.push('A complete legal equipment set could not be established')
  reasons.push(...bestUnknowns)
  const complete=!exhausted
  const status:ProgressionView['status']=best?(reasons.length?'partial':'supported'):'unsupported'
  const ledger=Object.entries(bestCost).map(([currencyId,spent])=>({currencyId,balance:inventory.currencies?.[currencyId]??null,spent,remaining:inventory.currencies?.[currencyId]!==undefined?inventory.currencies[currencyId]!-spent:null}))
  const selectedItems=best as ItemVariant[]|null
  return {status,itemLevel:status==='supported'?bestLevel:null,bestKnownItemLevel:selectedItems?bestLevel:null,items:selectedItems??[],costs:ledger,reasons:unique(reasons),evidenceRefs:combineEvidence(...(selectedItems??[]).map(item=>item.evidenceRefs)),searchComplete:complete}
}

export function evaluateProgression(input:Input):ProgressionResult {
  const {baseline,inventory,context,preferences}=input
  const evidenceRefs=combineEvidence(baseline.evidenceRefs,inventory.evidenceRefs)
  const observed=baseline.equippedItemLevel??averageEquippedItemLevel(baseline.items,baseline.weaponConfiguration)
  const equipped:ProgressionView={status:observed===null?'unsupported':'supported',itemLevel:observed,bestKnownItemLevel:observed,items:baseline.items,costs:[],reasons:observed===null?['Equipped item level has not been observed']:[],evidenceRefs:baseline.evidenceRefs,searchComplete:true}
  const rejected=input.ruleset?rulesetRejectionReasons(input.ruleset,context):['No validated seasonal rules support this character and build']
  if(inventory.characterId!==baseline.characterId)rejected.push('The inventory belongs to another character')
  const empty=(reasons:string[]):ProgressionView=>({status:'unsupported',itemLevel:null,bestKnownItemLevel:null,items:[],costs:[],reasons,evidenceRefs,searchComplete:false})
  let ownedUpgrade:ProgressionView,contentScoped:ProgressionView,legalMaximum:ProgressionView,affordable:ProgressionView
  if(rejected.length){ownedUpgrade=empty(rejected);contentScoped=empty(rejected);legalMaximum=empty(rejected);affordable=empty(rejected)}
  else {
    const rules=input.ruleset!
    const now=Date.parse(context.now)
    const owned=[...new Map([...baseline.items,...inventory.items.filter(item=>item.owned)].map(item=>[`${item.slot}:${item.variantKey}`,{...item,owned:true,currencyCost:[]}])).values()]
    const upgrades=upgradeVariants(owned,rules,inventory,context)
    const ownedPool=[...owned,...upgrades.items]
    const all=[...ownedPool,...input.candidates.filter(item=>available(item,now))]
    const globalReasons=[...(rules.candidateCoverage==='complete'?[]:['The seasonal candidate catalog is incomplete']),...(all.some(item=>item.itemLevel===null)?['Some candidate item levels are unknown']:[])]
    const ownedReasons=[...upgrades.reasons,...(inventory.coverage==='complete'?[]:['Owned inventory coverage is incomplete'])]
    const budget=Number.isFinite(input.stateBudget)?Math.max(1,Math.min(1_000_000,Math.floor(input.stateBudget!))):100_000
    const shared={baseline,rules,inventory,budget}
    ownedUpgrade=solve({...shared,items:ownedPool,affordable:false,reasons:ownedReasons.filter(reason=>!reason.includes('cost or discount'))})
    const unknownSource=all.some(item=>!item.owned&&!item.source)
    const unknownDifficulty=preferences.difficulties.length>0&&all.some(item=>!item.owned&&item.source&&item.source.activity!=='crafting'&&item.source.activity!=='world'&&preferences.activities.includes(item.source.activity)&&item.source.difficulty===null)
    contentScoped=solve({...shared,items:all.filter(item=>allowsSource(item,preferences)),affordable:false,reasons:[...globalReasons,...(unknownSource?['Some candidate acquisition sources are unknown']:[]),...(unknownDifficulty?['Some candidate difficulties are unknown']:[])]})
    legalMaximum=solve({...shared,items:all,affordable:false,reasons:globalReasons})
    affordable=solve({...shared,items:ownedPool,affordable:true,reasons:[...ownedReasons,...(inventory.discountCoverage==='complete'||upgrades.items.every(item=>!!item.observedUpgrade)?[]:['Upgrade discounts have not been observed'])]})
  }
  const views={ownedUpgrade,contentScoped,legalMaximum,affordable}
  const slots=gearSlotSchema.options.map(slot=>{
    const current=baseline.items.find(item=>item.slot===slot)??null
    const selected=Object.fromEntries(Object.entries(views).map(([key,view])=>[key,view.items.find(item=>item.slot===slot)??null])) as Pick<SlotProgression,'ownedUpgrade'|'contentScoped'|'legalMaximum'|'affordable'>
    const reasons:string[]=[]
    if(!current)reasons.push(slot==='offHand'&&inferWeaponConfiguration(baseline.items,baseline)==='twoHand'?'The main-hand two-hand weapon counts in both weapon positions':'Current slot has not been observed')
    if(current?.coverage!=='complete')reasons.push('Some item variant details or restrictions are unknown')
    if(!current?.upgradeTrackId)reasons.push('No upgrade track has been established for this item')
    if(!input.ruleset||rejected.length)reasons.push(...rejected)
    return {slot,current,...selected,reasons:unique(reasons),evidenceRefs:combineEvidence(current?.evidenceRefs??[],...Object.values(selected).map(item=>item?.evidenceRefs??[]))}
  })
  const unresolved=unique([...rejected,...Object.values(views).flatMap(view=>view.reasons)])
  return {schemaVersion:1,characterId:baseline.characterId,equipped,...views,slots,ruleset:!rejected.length&&input.ruleset?{id:input.ruleset.id,name:input.ruleset.name,seasonId:input.ruleset.seasonId,effectiveFrom:input.ruleset.effectiveFrom,effectiveUntil:input.ruleset.effectiveUntil,sources:input.ruleset.sources}:null,preferences,evidenceRefs:combineEvidence(evidenceRefs,...Object.values(views).map(view=>view.evidenceRefs)),assumptions:['Item level is an equipment measure, not a simulated combat-performance score'],unresolved}
}
