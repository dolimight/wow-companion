import type { GearItem, GearSlot } from './domain'
import { itemLinkVariant } from './item-link'

export type CompletionState='complete'|'missing'|'unknown'
export type SlotPlanCompletion={slot:GearSlot;acquisition:CompletionState;rank:CompletionState;enhancements:CompletionState;variant:CompletionState;complete:boolean;reasons:string[]}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function enhance(item:GearItem){
  const raw=itemLinkVariant(item.itemLink)
  return {
    enchant:item.enchantId??raw.enchantId??(item.enchantCoverage==='complete'&&!item.enchant?0:null),
    gems:item.gemIds??raw.gemIds??(item.gemsCoverage==='complete'&&!item.gems.length?[]:null),
  }
}
function enhancements(actual:GearItem|undefined,planned:GearItem):CompletionState {
  const target=enhance(planned),observed=actual?enhance(actual):null
  const checks:CompletionState[]=[]
  if(target.enchant!==null)checks.push(!observed?'missing':observed.enchant===null?'unknown':observed.enchant===target.enchant?'complete':'missing')
  else if(planned.enchant)checks.push(!actual?'missing':actual.enchantCoverage!=='complete'?'unknown':actual.enchant===planned.enchant?'complete':'missing')
  else checks.push('unknown')
  if(target.gems!==null)checks.push(!observed?'missing':observed.gems===null?'unknown':same(observed.gems.filter(Boolean),target.gems.filter(Boolean))?'complete':'missing')
  else if(planned.gems.length)checks.push(!actual?'missing':actual.gemsCoverage!=='complete'?'unknown':same(actual.gems,planned.gems)?'complete':'missing')
  else checks.push('unknown')
  return checks.includes('missing')?'missing':checks.includes('unknown')?'unknown':'complete'
}

/** Acquisition is deliberately separate from rank, variants, and applied enhancements */
export function comparePlanCompletion(current:GearItem[],planned:GearItem[]):SlotPlanCompletion[]{
  return planned.map(target=>{
    const actual=current.find(item=>item.slot===target.slot&&item.itemId===target.itemId)
    const acquisition:CompletionState=target.itemId==null?'unknown':actual?'complete':'missing'
    let rank:CompletionState='unknown'
    if(target.itemLevel!=null)rank=!actual?'missing':actual.itemLevel==null?'unknown':actual.itemLevel>=target.itemLevel?'complete':'missing'
    if(target.upgradeRank!=null&&target.upgradeTrackId){
      const track:CompletionState=!actual?'missing':!actual.upgradeTrackId||actual.upgradeRank==null?'unknown':actual.upgradeTrackId===target.upgradeTrackId&&actual.upgradeRank>=target.upgradeRank?'complete':'missing'
      if(track!=='complete'||rank==='unknown')rank=track
    }
    const desiredBonuses=target.bonusIds??itemLinkVariant(target.itemLink).bonusIds
    const observedBonuses=actual&&(actual.bonusIds??itemLinkVariant(actual.itemLink).bonusIds)
    const variant:CompletionState=desiredBonuses==null?'unknown':!actual?'missing':observedBonuses==null?'unknown':same(desiredBonuses,observedBonuses)?'complete':'missing'
    const applied=enhancements(actual,target)
    const reasons:string[]=[]
    if(acquisition!=='complete')reasons.push(acquisition==='missing'?'The planned item is not equipped in this slot':'The plan has no verified item identity')
    if(rank!=='complete')reasons.push(rank==='missing'?'The planned item level or upgrade rank is not reached':'The target or observed upgrade level is unknown')
    if(applied!=='complete')reasons.push(applied==='missing'?'Planned gems or enchants remain outstanding':'Enhancement coverage is incomplete')
    if(variant!=='complete')reasons.push(variant==='missing'?'The observed variant differs from the planned variant':'Exact variant identifiers are incomplete')
    return {slot:target.slot,acquisition,rank,enhancements:applied,variant,complete:[acquisition,rank,applied,variant].every(state=>state==='complete'),reasons}
  })
}
