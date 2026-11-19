import { describe, expect, it } from 'vite-plus/test'
import { characterSchema, gearItemSchema } from '../../shared/domain'
import { pruneCache, screenKey } from './cache'

const item = (enchantId: number | null) => gearItemSchema.parse({ slot: 'back', itemId: 5, name: 'Cloak', itemLevel: 334, enchantId })
const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250, gear: [gearItemSchema.parse({ slot: 'head', itemId: 1, name: 'Helm', itemLevel: 321 })] })

describe('screening cache', () => {
  it('keys a result by the gear worn, the piece as the engine sees it, the fight, the iterations, and the engine', () => {
    const base = screenKey(knight, [item(7)], 'dungeon-slice', 1500, 'e1')
    expect(screenKey(knight, [item(7)], 'dungeon-slice', 1500, 'e1')).toBe(base)
    expect(screenKey(knight, [item(8)], 'dungeon-slice', 1500, 'e1')).not.toBe(base)
    expect(screenKey(knight, [item(7)], 'patchwerk', 1500, 'e1')).not.toBe(base)
    expect(screenKey(knight, [item(7)], 'dungeon-slice', 6000, 'e1')).not.toBe(base)
    expect(screenKey(knight, [item(7)], 'dungeon-slice', 1500, 'e2')).not.toBe(base)
    const regeared = { ...knight, gear: [gearItemSchema.parse({ slot: 'head', itemId: 1, name: 'Helm', itemLevel: 334 })] }
    expect(screenKey(regeared, [item(7)], 'dungeon-slice', 1500, 'e1')).not.toBe(base)
  })

  it('drops old entries, then the oldest past the limit', () => {
    const at = (day: number) => ({ mean: 1, error: 1, gain: 1, at: new Date(Date.UTC(2026, 10, day)).toISOString() })
    const pruned = pruneCache({ entries: { old: at(1), a: at(17), b: at(18), c: at(19) } }, new Date(Date.UTC(2026, 10, 19)), 2)
    expect(Object.keys(pruned.entries)).toEqual(['c', 'b'])
  })
})
