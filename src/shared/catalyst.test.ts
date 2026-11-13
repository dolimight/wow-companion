import { describe, expect, it } from 'vite-plus/test'
import { catalyzedBase, engineStats } from './catalyst'

describe('catalyzed tier pieces', () => {
  it('writes the base item stats for SimulationCraft, counting a hybrid line as the primary stat', () => {
    const power = { armor: 326, stats: [{ type: 74, name: 'Strength or Intellect', value: 189, secondary: false }, { type: 7, name: 'Stamina', value: 3910, secondary: false }, { type: 49, name: 'Mastery', value: 141, secondary: true }, { type: 36, name: 'Haste', value: 60, secondary: true }, { type: 62, name: 'Leech', value: 50, secondary: true }] }
    expect(engineStats(power, 'Strength')).toBe('326armor_189str_3910sta_141mastery_60haste')
    expect(engineStats(power, 'Agility')).toBe('326armor_3910sta_141mastery_60haste')
    expect(engineStats(power, null)).toBeNull()
  })
  it('finds the base from the cantrip only when one base drops with it', () => {
    const variant = (bonusId: number) => ({ bonusId, name: 'Cantrip', effect: '', icon: null })
    const sources = [{ itemId: 1, name: 'Skullcap', quality: 4, icon: null, stats: [], variants: [variant(14049)] }, { itemId: 2, name: 'Helm', quality: 4, icon: null, stats: [], variants: [variant(13846)] }, { itemId: 3, name: 'Plain', quality: 4, icon: null, stats: [], variants: [] }]
    expect(catalyzedBase(sources, [6652, 14049])?.itemId).toBe(1)
    expect(catalyzedBase(sources, [6652])).toBeNull()
    expect(catalyzedBase([...sources, { ...sources[0]!, itemId: 4 }], [14049])).toBeNull()
  })
})
