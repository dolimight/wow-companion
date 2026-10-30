import { describe, expect, it } from 'vite-plus/test'
import { gearSlotsForInventoryType } from './gamedata'

describe('gear slot mapping', () => {
  it('maps wearable inventory types onto planner slots', () => {
    expect(gearSlotsForInventoryType(1)).toEqual(['head'])
    expect(gearSlotsForInventoryType(11)).toEqual(['finger1', 'finger2'])
    expect(gearSlotsForInventoryType(12)).toEqual(['trinket1', 'trinket2'])
    expect(gearSlotsForInventoryType(17)).toEqual(['mainHand'])
  })
  it('ignores shirt and tabard inventory types that are not on the gear planner', () => {
    expect(gearSlotsForInventoryType(4)).toEqual([])
    expect(gearSlotsForInventoryType(19)).toEqual([])
  })
})
