import { describe, expect, it } from 'vite-plus/test'
import { effectText, scaledArmor, scaledEffects, scaledStats, type ItemStatBlock, type ScalingLevel, type SpellData } from './item-scaling'
import { parseGameTable } from '../main/gamedata/engine'

// Rows copied from the installed Retail 12.1.5.70783 client (RandPropPoints, CombatRatingsMultByILvl,
// StaminaMultByILvl, ItemArmorTotal, ItemArmorQuality); expected values are Blizzard's equipment data and Wowhead tooltips
const level321: ScalingLevel = {
  itemLevel: 321,
  epic: [317.6564636230469, 238.2423553466797, 178.6817626953125, 158.82823181152344, 158.82823181152344],
  superior: [317.6564636230469, 238.2423553466797, 178.6817626953125, 158.82823181152344, 158.82823181152344],
  good: [317.6564636230469, 238.2423553466797, 178.6817626953125, 158.82823181152344, 158.82823181152344],
  damageReplace: 335.0476989746094, damageSecondary: 583.4071044921875,
  rating: { armor: 0.856210407, weapon: 0.856210407, trinket: 0.856210407, jewelry: 1.201698816 },
  stamina: { armor: 13.44269711, weapon: 13.44269711, trinket: 13.44269711, jewelry: 13.44269711 },
  armorTotal: { cloth: 653.5074462890625, leather: 1122.195556640625, mail: 1654.7957763671875, plate: 2489.20263671875 },
  armorQuality: [0.8999999761581421, 0.949999988079071, 1, 1, 1, 1, 1], shield: null, socketCost: 0,
}
const level308: ScalingLevel = {
  ...level321, itemLevel: 308,
  epic: [281.4186706542969, 211.06399536132812, 158.29800415039062, 140.70933532714844, 140.70933532714844],
  damageReplace: 293.75482177734375, damageSecondary: 483.67279052734375,
  rating: { armor: 0.913097959, weapon: 0.913097959, trinket: 0.913097959, jewelry: 1.24970913 },
  stamina: { armor: 13.04264226, weapon: 13.04264226, trinket: 13.04264226, jewelry: 13.04264226 },
}

const twoHander: ItemStatBlock = { statTypes: [4, 7, 32, 36, -1], alloc: [5259, 7889, 4190, 2810, 0], socketShare: [], inventoryType: 17, classId: 2, subclassId: 1, quality: 4 }
const plateHelm: ItemStatBlock = { statTypes: [74, 7, 32, 49], alloc: [5259, 7889, 4856, 2144], socketShare: [], inventoryType: 1, classId: 4, subclassId: 4, quality: 4 }
const trinket: ItemStatBlock = { statTypes: [71], alloc: [6666], socketShare: [], inventoryType: 12, classId: 4, subclassId: 0, quality: 4 }

describe('item scaling from game tables', () => {
  it('matches Blizzard stats for a 321 two-handed weapon', () => {
    expect(scaledStats(twoHander, level321)?.map(stat => `${stat.value} ${stat.name}`)).toEqual(['167 Strength', '3369 Stamina', '114 Critical Strike', '76 Haste'])
  })
  it('matches Blizzard armour on a 321 plate helm and names a flexible primary stat', () => {
    expect(scaledArmor(plateHelm, level321, { cloth: 0.12, leather: 0.12, mail: 0.12, plate: 0.12 })).toBe(299)
    expect(scaledStats(plateHelm, level321)?.[0]).toMatchObject({ name: 'Strength or Intellect', value: 167, secondary: false })
  })
  it('leaves stats unknown when the rating table is missing', () => {
    expect(scaledStats(twoHander, { ...level321, rating: null })).toBeNull()
  })
  it('fills a trinket effect the way the game tooltip shows it at 308', () => {
    const spells = new Map<number, SpellData>([
      [1294329, { id: 1294329, name: 'Effigy', description: 'Your spells and abilities have a chance to grant you $s1 of a random secondary stat and $s2 of a random tertiary stat for $1296714d.', durationMs: null, maxStacks: null, effects: [{ index: 0, coefficient: 1.409412145614624, scalingClass: -7, basePoints: 0, periodMs: 0 }, { index: 1, coefficient: 0.7047860622406006, scalingClass: -7, basePoints: 0, periodMs: 0 }] }],
      [1296714, { id: 1296714, name: 'Buff', description: '', durationMs: 12_000, maxStacks: null, effects: [] }],
    ])
    expect(scaledStats(trinket, level308)?.[0]?.value).toBe(141)
    expect(scaledEffects([{ spellId: 1294329, trigger: 1, cooldownMs: -1, charges: 0 }], spells, trinket, level308)).toEqual([
      { label: 'Equip', text: 'Your spells and abilities have a chance to grant you 362 of a random secondary stat and 181 of a random tertiary stat for 12 sec.', complete: true, cooldown: null },
    ])
  })
  it('marks text it cannot resolve instead of guessing', () => {
    const spells = new Map<number, SpellData>([[1, { id: 1, name: 'X', description: 'Deals $s1 damage and $<custom> more$?a123[ with talent][].', durationMs: null, maxStacks: null, effects: [{ index: 0, coefficient: 2, scalingClass: -9, basePoints: 0, periodMs: 0 }] }]])
    expect(effectText(1, spells, trinket, level321)).toEqual({ text: 'Deals 1,167 damage and ? more.', complete: false })
  })
  it('reads tab-separated game tables', () => {
    expect(parseGameTable('Item Level\tArmor\tWeapon\r\n1\t0.5\t0.6\r\n2\t0.7\t0.8\r\n').get(2)).toEqual([0.7, 0.8])
  })
})
