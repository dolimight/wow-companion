import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { addItemToPlan, addSimulatedItemsToPlan, undoPlan, authoredGoals, gearMemory, itemToGear, pickPlanSlot, planKey, stagePlanItem } from './plan-item'

import { characterSchema, gearDraftSchema } from '../../shared/domain'

import { api } from './client'

import type { GearItem } from '../../shared/domain'

import type { ItemSummary } from '../../shared/gamedata'



vi.mock('./client',()=>({api:{getItem:vi.fn(),getGearDraft:vi.fn(),saveGearDraft:vi.fn(),itemPower:vi.fn()}}))

beforeEach(()=>{gearMemory.clear();vi.resetAllMocks();vi.mocked(api.getGearDraft).mockResolvedValue(null)})



const item: ItemSummary = {

  id: 42,

  name: 'Searchable Helm',

  quality: 4,

  itemLevel: 720,

  requiredLevel: 80,

  slot: 'Head',

  inventoryType: 1,

  armor: 'plate',

  icon: 1,

  expansion: 11,

  sources: [],

}



function gear(slot: GearItem['slot'], itemId: number | null = 7): GearItem {

  return {

    slot,

    name: slot,

    itemId,

    itemLevel: 700,

    enchant: null,

    gems: [],

    gemsCoverage: 'unknown',

    enchantCoverage: 'unknown',

    appearanceId: null,

    itemLink: null,

    stats: [],

    effects: [],

  }

}



describe('plan item placement', () => {

  it('rejects a known incompatible class before creating or changing a plan', async()=>{

    const character=characterSchema.parse({id:'mage',name:'Astra',region:'us',realm:'One',className:'Mage',specId:62,level:90})

    const plate={...item,classId:4,subclassId:4,allowableClassMask:-1,specIds:[],primaryStats:['strength' as const]}

    expect(await addItemToPlan({character,activity:'mythicPlus',item:plate,preferredSlot:'head'})).toBeNull()

    expect(gearMemory.size).toBe(0);expect(api.getGearDraft).not.toHaveBeenCalled()

  })

  it('rechecks older cached item data before adding a result to a plan', async()=>{

    const character=characterSchema.parse({id:'mage',name:'Astra',region:'us',realm:'One',className:'Mage',specId:62,level:90})

    vi.mocked(api.getItem).mockResolvedValue({...item,classId:4,subclassId:4,allowableClassMask:-1,specIds:[],primaryStats:['strength'],bonding:null,sockets:0,description:'',appearances:[]})

    expect(await addItemToPlan({character,activity:'mythicPlus',item})).toBeNull()

    expect(api.getItem).toHaveBeenCalledWith(item.id);expect(gearMemory.size).toBe(0)

  })

  it('adds compatible gear to the selected character and rejects an incompatible preferred slot', async()=>{

    const character=characterSchema.parse({id:'dk',name:'Astra',region:'us',realm:'One',className:'Death Knight',specId:250,level:90})

    const plate={...item,classId:4,subclassId:4,allowableClassMask:-1,specIds:[],primaryStats:['strength' as const]}

    expect(await addItemToPlan({character,activity:'mythicPlus',item:plate,preferredSlot:'offHand'})).toBeNull()

    expect(await addItemToPlan({character,activity:'mythicPlus',item:plate,preferredSlot:'head'})).toBe('head')

    expect(gearMemory.get(planKey(character.id,'mythicPlus',250))?.items[0]?.itemId).toBe(42)

  })

  it('fills an empty ring before replacing one that already has an item', () => {

    expect(pickPlanSlot(['finger1', 'finger2'], [gear('finger1')])).toBe('finger2')

    expect(pickPlanSlot(['finger1', 'finger2'], [gear('finger1'), gear('finger2')])).toBe('finger1')

  })

  it('keeps the preferred slot when searching from the inspector', () => {

    expect(pickPlanSlot(['finger1', 'finger2'], [gear('finger1', null)], 'finger2')).toBe('finger2')

  })

  it('copies the searched item name and id onto the planned slot', () => {

    const planned = itemToGear('head', item, gear('head'))

    expect(planned.name).toBe('Searchable Helm')

    expect(planned.itemId).toBe(42)

    expect(planned.itemLevel).toBe(720)

    expect(planned.enchant).toBeNull()

  })

})



describe('shared plan staging policy', () => {

  const dk = () => characterSchema.parse({ id: 'dk', name: 'Astra', region: 'us', realm: 'One', className: 'Death Knight', specId: 250, level: 90, gear: [gear('head', 7)] })

  const plate = { ...item, classId: 4, subclassId: 4, allowableClassMask: -1, specIds: [], primaryStats: ['strength' as const] }

  it('puts a target on a slot that still holds the observed item without asking', async () => {

    expect(await stagePlanItem({ character: dk(), activity: 'mythicPlus', item: plate, preferredSlot: 'head' })).toEqual({ status: 'added', slot: 'head' })

    const staged = gearMemory.get(planKey('dk', 'mythicPlus', 250))

    // Staging saves the plan at once
    expect(staged?.dirty).toBe(false)
    expect(vi.mocked(api.saveGearDraft).mock.calls[0]?.[0].items.find(entry => entry.slot === 'head')?.itemId).toBe(42)

    expect(staged?.items.find((entry: GearItem) => entry.slot === 'head')?.itemId).toBe(42)

  })

  it('treats the identical exact variant as a no-op that keeps authored goals', async () => {

    const character = dk()

    await stagePlanItem({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })

    const key = planKey('dk', 'mythicPlus', 250), memory = gearMemory.get(key)!

    gearMemory.set(key, { ...memory, items: memory.items.map(entry => ({ ...entry, enchant: 'Authored enchant' })) })

    expect(await stagePlanItem({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })).toEqual({ status: 'noop', slot: 'head' })

    expect(gearMemory.get(key)?.items.find(entry => entry.slot === 'head')?.enchant).toBe('Authored enchant')

  })

  it('asks before replacing a different target, then clears the old goals on confirmation', async () => {

    const character = dk()

    await stagePlanItem({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })

    const key = planKey('dk', 'mythicPlus', 250), memory = gearMemory.get(key)!

    gearMemory.set(key, { ...memory, items: memory.items.map(entry => ({ ...entry, enchant: 'Old enchant', gems: ['Old gem'] })) })

    const other = { ...plate, id: 99, name: 'Other Helm' }

    const conflict = await stagePlanItem({ character, activity: 'mythicPlus', item: other, preferredSlot: 'head' })

    expect(conflict.status).toBe('conflict')

    expect(gearMemory.get(key)?.items.find((entry: GearItem) => entry.slot === 'head')?.itemId).toBe(42)

    if (conflict.status === 'conflict') expect(authoredGoals(conflict.current)).toEqual(['Item level 720', 'Enchant: Old enchant', 'Gems: Old gem'])

    expect(await stagePlanItem({ character, activity: 'mythicPlus', item: other, preferredSlot: 'head', replace: true })).toEqual({ status: 'replaced', slot: 'head' })

    const replaced = gearMemory.get(key)?.items.find(entry => entry.slot === 'head')

    expect(replaced).toMatchObject({ itemId: 99, enchant: null, gems: [] })

  })

  it('keeps the exact owned copy identity without turning observed enhancements into goals', async () => {

    const owned = { ...gear('head', 555), itemLink: '|cnIQ4:|Hitem:555|h[Owned]|h|r', instanceId: 'abc', enchant: 'Observed enchant', gems: ['Observed gem'] }

    vi.mocked(api.getItem).mockResolvedValue(null as never)

    expect(await stagePlanItem({ character: dk(), activity: 'mythicPlus', exact: owned })).toEqual({ status: 'added', slot: 'head' })

    expect(gearMemory.get(planKey('dk', 'mythicPlus', 250))?.items.find(entry => entry.slot === 'head')).toMatchObject({ itemId: 555, itemLink: owned.itemLink, instanceId: 'abc', enchant: null, gems: [] })

  })

  it('does not stage an item the class cannot use', async () => {

    const mage = characterSchema.parse({ id: 'mage', name: 'Astra', region: 'us', realm: 'One', className: 'Mage', specId: 62, level: 90 })

    expect(await stagePlanItem({ character: mage, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })).toEqual({ status: 'incompatible' })

    expect(gearMemory.size).toBe(0)

  })

})


describe('adding simulated items to a plan', () => {
  const owner = characterSchema.parse({ id: 'c1', name: 'Tester', realm: 'Realm', region: 'us', className: 'Death Knight', specId: 250, specName: 'Blood', level: 90, gear: [gear('head', 1), gear('neck', 2)] })
  it('saves a plan without unsaved edits right away, keeping its id and other slots', async () => {
    vi.mocked(api.getGearDraft).mockResolvedValue({ id: 'draft', characterId: 'c1', specId: 250, activity: 'raiding', rulesetId: 'r', plan: 'main', name: 'Raid plan', items: [gear('head', 1), gear('neck', 2)], updatedAt: '2026-11-01T00:00:00.000Z' })
    vi.mocked(api.saveGearDraft).mockImplementation(async draft => gearDraftSchema.parse(draft))
    const outcome = await addSimulatedItemsToPlan({ character: owner, activity: 'raiding', items: [{ ...gear('head', 99), itemLevel: 740, enchant: 'Copied enchant' }] })
    expect(outcome).toEqual({ saved: true, slots: ['head'] })
    const saved = vi.mocked(api.saveGearDraft).mock.calls[0]![0]
    expect(saved).toMatchObject({ id: 'draft', activity: 'raiding', name: 'Raid plan', rulesetId: 'r' })
    expect(saved.items).toMatchObject([{ slot: 'neck', itemId: 2 }, { slot: 'head', itemId: 99, itemLevel: 740, enchant: null }])
    expect(gearMemory.get(planKey('c1', 'raiding', 250))?.dirty).toBe(false)
  })
  it('saves alongside edits still waiting to save, and Undo puts back the plan as it was', async () => {
    const before = { id: 'draft', characterId: 'c1', specId: 250, activity: 'mythicPlus' as const, rulesetId: 'r', plan: 'main', name: 'Raid plan', items: [gear('head', 1)], updatedAt: '2026-11-01T00:00:00.000Z' }
    vi.mocked(api.getGearDraft).mockResolvedValue(before)
    vi.mocked(api.saveGearDraft).mockImplementation(async draft => gearDraftSchema.parse(draft))
    gearMemory.set(planKey('c1', 'mythicPlus', 250), { items: [gear('head', 5)], name: 'Edited', dirty: true })
    const outcome = await addSimulatedItemsToPlan({ character: owner, activity: 'mythicPlus', items: [gear('neck', 77)] })
    expect(outcome.saved).toBe(true)
    expect(gearMemory.get(planKey('c1', 'mythicPlus', 250))).toMatchObject({ dirty: false, items: [{ slot: 'head', itemId: 5 }, { slot: 'neck', itemId: 77 }] })
    await undoPlan({ characterId: 'c1', activity: 'mythicPlus', specId: 250, gear: [] }, before)
    expect(vi.mocked(api.saveGearDraft).mock.calls.at(-1)?.[0]).toMatchObject({ id: 'draft', name: 'Raid plan', items: [{ slot: 'head', itemId: 1 }] })
    expect(gearMemory.get(planKey('c1', 'mythicPlus', 250))).toMatchObject({ dirty: false, items: [{ slot: 'head', itemId: 1 }] })
  })
  it('undoes a first save back to the gear the character wears', async () => {
    vi.mocked(api.saveGearDraft).mockImplementation(async draft => gearDraftSchema.parse(draft))
    await undoPlan({ characterId: 'c1', activity: 'mythicPlus', specId: 250, gear: [gear('head', 9)] }, null)
    expect(vi.mocked(api.saveGearDraft).mock.calls.at(-1)?.[0]).toMatchObject({ name: 'My upgrade plan', items: [{ slot: 'head', itemId: 9 }] })
  })
})

describe('planned level for a new target', () => {
  const character = characterSchema.parse({ id: 'dk', name: 'Astra', region: 'us', realm: 'One', className: 'Death Knight', specId: 250, level: 90 })
  const plate = { ...item, itemLevel: 219, classId: 4, subclassId: 4, allowableClassMask: -1, specIds: [], primaryStats: ['strength' as const] }
  const levelOf = () => gearMemory.get(planKey(character.id, 'mythicPlus', 250))?.items.find(entry => entry.slot === 'head')?.itemLevel
  it('starts at the highest level from the search row', async () => {
    await addItemToPlan({ character, activity: 'mythicPlus', item: { ...plate, maxLevel: { itemLevel: 334 } } as never, preferredSlot: 'head' })
    expect(levelOf()).toBe(334)
    expect(api.itemPower).not.toHaveBeenCalled()
  })
  it('copies the level and bonus IDs top players wear instead of a lower estimate from the game files', async () => {
    vi.mocked(api.itemPower).mockResolvedValue({ tracks: { max: { itemLevel: 334 } } } as never)
    expect(await stagePlanItem({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head', copy: { itemLevel: 342, bonusIds: [10390, 12350] } })).toEqual({ status: 'added', slot: 'head' })
    const staged = gearMemory.get(planKey(character.id, 'mythicPlus', 250))?.items.find(entry => entry.slot === 'head')
    expect(staged).toMatchObject({ itemLevel: 342, bonusIds: [10390, 12350], variantCoverage: 'partial', levelSource: 'observed' })
    expect(api.itemPower).not.toHaveBeenCalled()
  })
  it('starts a new target at the top crest rank, leaving Venomstone and Elevated levels to pick', async () => {
    await addItemToPlan({ character, activity: 'mythicPlus', item: { ...plate, maxLevel: { itemLevel: 344, ladderLevel: 334 } } as never, preferredSlot: 'head' })
    expect(levelOf()).toBe(334)
  })
  it('marks a level that only came from the game files as an estimate', async () => {
    vi.mocked(api.itemPower).mockResolvedValue({ tracks: { max: { itemLevel: 334 } } } as never)
    await stagePlanItem({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })
    expect(gearMemory.get(planKey(character.id, 'mythicPlus', 250))?.items.find(entry => entry.slot === 'head')).toMatchObject({ itemLevel: 334, levelSource: 'estimated' })
  })
  it('looks up the upgrade tracks when the row did not carry them, and keeps the base level when none are known', async () => {
    vi.mocked(api.itemPower).mockResolvedValue({ tracks: { max: { itemLevel: 321 } } } as never)
    await addItemToPlan({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })
    expect(levelOf()).toBe(321)
    gearMemory.clear()
    vi.mocked(api.itemPower).mockRejectedValue(new Error('Item data is still being prepared'))
    await addItemToPlan({ character, activity: 'mythicPlus', item: plate, preferredSlot: 'head' })
    expect(levelOf()).toBe(219)
  })
})
