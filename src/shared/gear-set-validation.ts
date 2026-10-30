import { gearSlotSchema, type GearSlot } from './domain'
import type { GearBaseline, ItemVariant } from './gear-variants'
import { getItemCompatibility } from './item-compatibility'
import type { ItemSummary } from './gamedata'
import type { SeasonRuleset } from './season-rules'

export const progressionArmorSlots=gearSlotSchema.options.filter(slot=>slot!=='mainHand'&&slot!=='offHand')
export type GearSetValidation={status:'valid'|'invalid'|'unknown';violations:string[];unknowns:string[];weaponConfiguration:'twoHand'|'dual'|'unknown'}
export function asCompatibilityItem(item:ItemVariant):ItemSummary {
  return {id:item.itemId??0,name:item.name,quality:1,itemLevel:item.itemLevel??0,requiredLevel:item.requiredLevel??0,slot:item.slot,inventoryType:item.inventoryType??0,armor:null,icon:null,expansion:0,sources:[],classId:item.classId??undefined,subclassId:item.subclassId??undefined,allowableClassMask:item.allowableClassMask,specIds:item.specIds,primaryStats:item.primaryStats}
}
export function inferWeaponConfiguration(items:ItemVariant[],baseline:GearBaseline):'twoHand'|'dual'|'unknown' {
  const main=items.find(item=>item.slot==='mainHand')
  const off=items.find(item=>item.slot==='offHand'&&(item.itemId!==null||item.itemLevel!==0))
  if(!main)return 'unknown'
  if(main.inventoryType===17||main.inventoryType===15||(main.inventoryType===26&&main.subclassId!==19))return baseline.specId===72?(off?'dual':'unknown'):'twoHand'
  if(off)return 'dual'
  if(main.inventoryType===null&&baseline.weaponConfiguration==='twoHand')return 'twoHand'
  return 'unknown'
}
export function validateGearSet(items:ItemVariant[],ruleset:SeasonRuleset,baseline:GearBaseline):GearSetValidation {
  const violations:string[]=[],unknowns:string[]=[]
  const slots=new Set<GearSlot>()
  const instances=new Set<string>()
  const groups=new Map<string,number>()
  const unique=new Map<string,number>()
  const context={className:baseline.className,specId:baseline.specId,level:baseline.level}
  for(const item of items){
    if(slots.has(item.slot))violations.push(`More than one item occupies ${item.slot}`)
    slots.add(item.slot)
    if(item.instanceId){if(instances.has(item.instanceId))violations.push('The same item instance occupies multiple slots');instances.add(item.instanceId)}
    if(item.itemLevel===null)unknowns.push(`Item level is unknown for ${item.slot}`)
    if(item.inventoryType===null&&item.itemId!==null)unknowns.push(`Inventory type is unknown for ${item.slot}`)
    if(item.requiredLevel===null&&item.itemId!==null)unknowns.push(`Required level is unknown for ${item.slot}`)
    if(item.coverage!=='complete')unknowns.push(`Restrictions are not completely observed for ${item.slot}`)
    if(item.owned&&!item.observedAt)unknowns.push(`The observation time for ${item.slot} is unknown`)
    if(item.itemId!==null){
      const compatibility=getItemCompatibility(asCompatibilityItem(item),context,item.inventoryType===null?{}:{slot:item.slot})
      if(!compatibility.compatible)violations.push(`${item.slot}: ${compatibility.reason}`)
      else if(!compatibility.verified)unknowns.push(`${item.slot}: ${compatibility.reason}`)
    }else if(item.itemLevel!==0)unknowns.push(`Item identity is unknown for ${item.slot}`)
    for(const group of item.uniqueGroups)unique.set(group,(unique.get(group)??0)+1)
    for(const group of item.restrictionGroups)groups.set(group,(groups.get(group)??0)+1)
  }
  for(const [group,count]of unique)if(count>1)violations.push(`Only one item from ${group} may be equipped`)
  for(const restriction of ruleset.restrictions)if((groups.get(restriction.group)??0)>restriction.maxEquipped)violations.push(`The ${restriction.group} limit is ${restriction.maxEquipped}`)
  for(const group of groups.keys())if(!ruleset.restrictions.some(rule=>rule.group===group)&&!ruleset.minimumGroups.some(rule=>rule.group===group))unknowns.push(`The ${group} restriction is not covered by this ruleset`)
  for(const minimum of ruleset.minimumGroups)if((groups.get(minimum.group)??0)<minimum.minEquipped)violations.push(`At least ${minimum.minEquipped} items from ${minimum.group} are required`)
  for(const slot of [...progressionArmorSlots,'mainHand'] as GearSlot[])if(!slots.has(slot))unknowns.push(`No observed item for ${slot}`)
  const weaponConfiguration=inferWeaponConfiguration(items,baseline)
  if(weaponConfiguration==='unknown')unknowns.push('The weapon configuration is unknown')
  if(weaponConfiguration==='dual'&&!slots.has('offHand'))unknowns.push('No observed off-hand item')
  if(weaponConfiguration==='twoHand'&&items.some(item=>item.slot==='offHand'&&(item.itemId!==null||item.itemLevel!==0)))violations.push('A two-hand weapon cannot be paired with this off-hand item')
  if(ruleset.constraintsCoverage!=='complete')unknowns.push('Seasonal equipment restrictions are incomplete')
  return {status:violations.length?'invalid':unknowns.length?'unknown':'valid',violations:[...new Set(violations)],unknowns:[...new Set(unknowns)],weaponConfiguration}
}
