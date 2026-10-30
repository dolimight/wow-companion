import { describe,expect,it } from 'vite-plus/test'
import { averageEquippedItemLevel,deriveProgression } from './progression'
import { gearItemSchema,type GearSlot } from './domain'
const slots:GearSlot[]=['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2','mainHand']
const gear=slots.map(slot=>gearItemSchema.parse({slot,itemId:1,name:'Item',itemLevel:250}))
describe('item-level progression',()=>{
  it('counts an explicitly two-handed weapon twice in the 16-slot average',()=>{expect(averageEquippedItemLevel(gear.map(i=>({...i,itemLevel:i.slot==='mainHand'?266:250})),'twoHand')).toBe(252);expect(averageEquippedItemLevel(gear,'unknown')).toBeNull();expect(averageEquippedItemLevel(gear,'dual')).toBeNull()})
  it('preserves unknown data and exposes measured gaps without a made-up cap',()=>{expect(averageEquippedItemLevel(gear.slice(1),'twoHand')).toBeNull();const result=deriveProgression({itemLevel:250,targetItemLevel:270,maxItemLevel:null,gear});expect(result.gapToTarget).toBe(20);expect(result.gapToMaximum).toBeNull();expect(result.weakestSlots).toHaveLength(3)})
})
