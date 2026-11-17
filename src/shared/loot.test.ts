import { describe, expect, it } from 'vite-plus/test'
import type { LootItem } from './dungeons'
import { inLootTable, isGearDrop, lootKind, uniqueDrops, voidcoreShare } from './loot'

const item = (patch: Partial<LootItem>): LootItem => ({ id: 1, name: 'Item', quality: 4, slot: 'Chest', inventoryType: 20, armor: 'cloth', icon: null, requiredLevel: 0, classId: 4, subclassId: 1, allowableClassMask: -1, specIds: [], primaryStats: ['intellect'], ...patch })
const arcane = { className: 'Mage', specId: 62, level: 90 }

describe('loot tables', () => {
  it('keeps gear and tier tokens, never collectibles', () => {
    expect(isGearDrop(item({}))).toBe(true)
    expect(isGearDrop(item({ inventoryType: 0, classId: 15, subclassId: 0, allowableClassMask: 400 }))).toBe(true)
    expect(isGearDrop(item({ inventoryType: 0, classId: 15, subclassId: 5 }))).toBe(false)
    expect(isGearDrop(item({ inventoryType: 0, classId: 20, subclassId: 0 }))).toBe(false)
  })

  it('names what a drop is where its slot says Other', () => {
    expect(lootKind(item({}))).toBe('Cloth · Chest')
    expect(lootKind(item({ inventoryType: 0, slot: 'Other', classId: 15, subclassId: 0, allowableClassMask: 400 }))).toBe('Tier token')
    expect(lootKind(item({ inventoryType: 0, slot: 'Other', classId: 15, subclassId: 5 }))).toBe('Mount')
    expect(lootKind(item({ inventoryType: 0, slot: 'Other', classId: 20, subclassId: 0 }))).toBe('Decor')
  })

  it('pools only what drops for the loot specialization', () => {
    expect(inLootTable(item({}), arcane)).toBe(true)
    expect(inLootTable(item({ armor: 'plate', subclassId: 4, primaryStats: ['strength'] }), arcane)).toBe(false)
    // Mage is class 8, so its token bit is 128; 4164 is the mail token
    expect(inLootTable(item({ inventoryType: 0, slot: 'Other', armor: null, classId: 15, subclassId: 0, allowableClassMask: 400, specIds: null, primaryStats: null }), arcane)).toBe(true)
    expect(inLootTable(item({ inventoryType: 0, slot: 'Other', armor: null, classId: 15, subclassId: 0, allowableClassMask: 4164, specIds: null, primaryStats: null }), arcane)).toBe(false)
    // Any class can wear a trinket, but it is only on the loot tables of the specs it lists
    expect(inLootTable(item({ inventoryType: 12, slot: 'Trinket', armor: null, classId: 4, subclassId: 0, specIds: [65, 105] }), arcane)).toBe(false)
    expect(inLootTable(item({ inventoryType: 12, slot: 'Trinket', armor: null, classId: 4, subclassId: 0, specIds: [62, 63] }), arcane)).toBe(true)
  })

  it('gives each item of the pool an equal share', () => {
    expect(voidcoreShare(12)).toBe(8.3)
    expect(voidcoreShare(3)).toBe(33.3)
    expect(voidcoreShare(0)).toBe(0)
  })
})

describe('reissued loot', () => {
  it('keeps the newer of two items with the same name and slot, in journal order', () => {
    const list = [item({ id: 5, name: 'Headdress', inventoryType: 1 }), item({ id: 2, name: 'Robe' }), item({ id: 9, name: 'Headdress', inventoryType: 1 }), item({ id: 3, name: 'Headdress', inventoryType: 20 })]
    expect(uniqueDrops(list).map(entry => entry.id)).toEqual([2, 9, 3])
  })
})
