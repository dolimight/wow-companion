import type { GearItem, Character } from './domain'
const requiredSlots=['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2'] as const
/** Empty slots require an explicit level 0 entry; absent data remains unknown */
export function averageEquippedItemLevel(gear:Pick<GearItem,'slot'|'itemLevel'>[],weapons:'twoHand'|'dual'|'unknown'):number|null {
  if(weapons==='unknown')return null
  const bySlot=new Map(gear.map(item=>[item.slot,item]));if(bySlot.size!==gear.length)return null
  const levels=requiredSlots.map(slot=>bySlot.get(slot)?.itemLevel)
  const main=bySlot.get('mainHand')?.itemLevel;const off=weapons==='twoHand'?main:bySlot.get('offHand')?.itemLevel
  if([...levels,main,off].some(value=>value==null))return null
  return (levels.reduce<number>((sum,value)=>sum+value!,0)+main!+off!)/16
}
export function deriveProgression(character:Pick<Character,'itemLevel'|'targetItemLevel'|'maxItemLevel'|'gear'>) {
  return {equipped:character.itemLevel,target:character.targetItemLevel,maximum:character.maxItemLevel,gapToTarget:character.itemLevel!==null&&character.targetItemLevel!==null?Math.max(0,character.targetItemLevel-character.itemLevel):null,gapToMaximum:character.itemLevel!==null&&character.maxItemLevel!==null?Math.max(0,character.maxItemLevel-character.itemLevel):null,weakestSlots:character.gear.filter((item):item is GearItem&{itemLevel:number}=>item.itemLevel!==null).sort((a,b)=>a.itemLevel-b.itemLevel).slice(0,3)}
}
