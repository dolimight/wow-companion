import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { addItemToPlan, authoredGoals, gearMemory, itemToGear, pickPlanSlot, planKey, stagePlanItem } from './plan-item'
import { characterSchema } from '../../shared/domain'
import { api } from './client'
import type { GearItem } from '../../shared/domain'
import type { ItemSummary } from '../../shared/gamedata'

vi.mock('./client',()=>({api:{getItem:vi.fn(),getGearDraft:vi.fn()}}))
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
    expect(staged?.dirty).toBe(true)
    expect(staged?.items.find(entry => entry.slot === 'head')?.itemId).toBe(42)
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
    expect(gearMemory.get(key)?.items.find(entry => entry.slot === 'head')?.itemId).toBe(42)
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
