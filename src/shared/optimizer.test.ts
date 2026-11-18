import { describe, expect, it } from 'vite-plus/test'
import { characterSchema, gearItemSchema, type GearSlot } from './domain'
import { bestCombos, greedyCombos, trimPool, wearable, type OptimizerCandidate, type OptimizerOrigin } from './optimizer'

const item = (slot: GearSlot, itemId: number, itemLevel: number) => gearItemSchema.parse({ slot, itemId, name: `Item ${itemId}`, itemLevel })
const candidate = (key: string, slot: GearSlot, itemId: number, itemLevel: number, origin: OptimizerOrigin = 'bags'): OptimizerCandidate => ({ key, slot, item: item(slot, itemId, itemLevel), origin, source: null, icon: null, quality: 4, popularity: null })
const mage = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Alwin', className: 'Mage', specName: 'Arcane', specId: 62, gear: [item('head', 1, 260), item('finger1', 10, 260), item('finger2', 11, 260)] })

describe('gear optimizer pool', () => {
  it('drops what is already worn, pieces far below it, and duplicates, keeping owned copies first', () => {
    const pool = [
      candidate('worn', 'head', 1, 260), candidate('low', 'head', 2, 240), candidate('ok', 'head', 3, 252),
      candidate('drop', 'head', 4, 272, 'drop'), candidate('owned', 'head', 4, 272, 'bank'),
    ]
    expect(trimPool(pool, mage).map(entry => entry.key)).toEqual(['owned', 'ok'])
  })

  it('keeps at most a few pieces per slot, highest level first', () => {
    const pool = Array.from({ length: 9 }, (_, at) => candidate(`h${at}`, 'head', 100 + at, 255 + at))
    expect(trimPool(pool, mage, 3).map(entry => entry.key)).toEqual(['h8', 'h7', 'h6'])
  })
})

describe('gear optimizer sets', () => {
  const pool = [
    candidate('r1a', 'finger1', 20, 272), candidate('r1b', 'finger2', 20, 272),
    candidate('r2a', 'finger1', 21, 268), candidate('r2b', 'finger2', 21, 268),
    candidate('head', 'head', 30, 272, 'vault'), candidate('neck', 'neck', 31, 272, 'vault'),
    candidate('target', 'back', 40, 285, 'drop'),
  ]
  const byKey = new Map(pool.map(entry => [entry.key, entry]))
  const screen = { r1a: { mean: 0, error: null, gain: 300 }, r1b: { mean: 0, error: null, gain: 320 }, r2a: { mean: 0, error: null, gain: 200 }, r2b: { mean: 0, error: null, gain: 100 }, head: { mean: 0, error: null, gain: 500 }, neck: { mean: 0, error: null, gain: 400 }, target: { mean: 0, error: null, gain: 900 } }

  it('never puts one ring in both slots and takes one vault choice', () => {
    const [owned] = greedyCombos(pool, screen)
    expect(owned?.picks).toEqual({ finger1: 'r2a', finger2: 'r1b', head: 'head' })
    expect(wearable({ finger1: 'r1a', finger2: 'r1b' }, byKey)).toBe(false)
    expect(wearable({ head: 'head', neck: 'neck' }, byKey)).toBe(false)
  })

  it('offers sets without the vault and with targets', () => {
    const sets = greedyCombos(pool, screen)
    expect(sets.map(set => set.key)).toEqual(['app-owned', 'app-owned-no-vault', 'app-all'])
    expect(sets[1]?.picks.head).toBeUndefined()
    expect(sets[2]?.picks.back).toBe('target')
  })

  it('names the best owned set and a target set only when it does better', () => {
    const sets = greedyCombos(pool, screen)
    const results = { 'app-owned': { mean: 0, error: null, gain: 900 }, 'app-owned-no-vault': { mean: 0, error: null, gain: 400 }, 'app-all': { mean: 0, error: null, gain: 1700 } }
    expect(bestCombos(sets, results, byKey)).toEqual({ wearNow: 'app-owned', chase: 'app-all' })
    expect(bestCombos(sets, { ...results, 'app-all': { mean: 0, error: null, gain: 800 } }, byKey)).toEqual({ wearNow: 'app-owned', chase: null })
  })
})
