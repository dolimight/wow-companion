import { describe, expect, it } from 'vite-plus/test'
import { characterSchema, gearItemSchema, type GearSlot } from './domain'
import { bestCombos, gearChanged, lootSources, upgradeAdvice, vaultChoices, vaultSets, greedyCombos, isGain, trimPool, upgradesToChase, wearable, type OptimizerCandidate, type OptimizerOrigin } from './optimizer'

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

  it('counts a gain only past its noise, so a lower piece within it never replaces what you wear', () => {
    expect(isGain({ mean: 0, error: 260, gain: 126 })).toBe(false)
    expect(isGain({ mean: 0, error: 260, gain: 1670 })).toBe(true)
    expect(isGain({ mean: 0, error: null, gain: 1 })).toBe(true)
    const pool = [candidate('k1', 'head', 7, 311, 'bags'), candidate('k2', 'trinket2', 8, 318, 'vault')]
    const sets = greedyCombos(pool, { [pool[0]!.key]: { mean: 0, error: 260, gain: 126 }, [pool[1]!.key]: { mean: 0, error: 260, gain: 1670 } })
    expect(sets.find(set => set.key === 'app-owned')?.picks).toEqual({ trinket2: pool[1]!.key })
  })

  it('lists each target worth chasing once, by what it adds over the best you own', () => {
    const pool = [candidate('u1', 'back', 1, 334, 'drop'), candidate('u2', 'back', 2, 320, 'bags'), candidate('u3', 'finger1', 3, 334, 'top'), candidate('u4', 'finger2', 3, 334, 'top'), candidate('u5', 'head', 4, 334, 'drop')]
    const screen = { [pool[0]!.key]: { mean: 0, error: 100, gain: 2000 }, [pool[1]!.key]: { mean: 0, error: 100, gain: 900 }, [pool[2]!.key]: { mean: 0, error: 100, gain: 1500 }, [pool[3]!.key]: { mean: 0, error: 100, gain: 2500 }, [pool[4]!.key]: { mean: 0, error: 100, gain: 200 } }
    const list = upgradesToChase({ pool, screen })
    expect(list.map(entry => [entry.candidate.slot, Math.round(entry.gain)])).toEqual([['finger2', 2500], ['back', 1100]])
  })

  it('notices gear changed since a run', () => {
    const equipped = [{ slot: 'head' as const, itemId: 1, itemLevel: 321 }]
    expect(gearChanged({ equipped }, [{ slot: 'head', itemId: 1, itemLevel: 321 }])).toBe(false)
    expect(gearChanged({ equipped }, [{ slot: 'head', itemId: 1, itemLevel: 334 }])).toBe(true)
    expect(gearChanged({}, [{ slot: 'head', itemId: 1, itemLevel: 334 }])).toBe(false)
  })

  it('ranks loot sources by their best clear gain per slot, counting a ring once', () => {
    const drop = (key: string, slot: GearSlot, itemId: number, instance: string, boss: string | null = null) => ({ ...candidate(key, slot, itemId, 305, 'drop'), instance, boss })
    const pool = [drop('a', 'back', 1, 'Vale'), drop('b', 'back', 2, 'Vale'), drop('c', 'finger1', 3, 'Vale'), drop('d', 'finger2', 3, 'Vale'), drop('e', 'head', 4, 'Rest'), drop('f', 'chest', 5, 'Rest')]
    const m = (gain: number) => ({ mean: 0, error: 10, gain })
    const sources = lootSources({ pool, screen: { a: m(500), b: m(900), c: m(300), d: m(400), e: m(1500), f: m(20) } })
    expect(sources.map(source => [source.instance, Math.round(source.total), source.pieces.length])).toEqual([['Rest', 1500, 1], ['Vale', 1300, 2]])
  })

  it('builds one set per vault choice on the best owned set, and takes one only past the noise', () => {
    const pool = [candidate('h', 'head', 1, 300, 'bags'), candidate('v1', 'back', 2, 310, 'vault'), candidate('v2', 'trinket1', 3, 310, 'vault')]
    const m = (gain: number) => ({ mean: 0, error: 40, gain })
    const sets = vaultSets(pool, { h: m(500), v1: m(300), v2: m(-50) })
    expect(sets.map(set => [set.key, set.picks])).toEqual([['vault-skip', { head: 'h' }], ['vault-1', { head: 'h', back: 'v1' }], ['vault-2', { head: 'h', trinket1: 'v2' }]])
    const clear = vaultChoices({ pool, combos: sets, results: { 'vault-skip': m(500), 'vault-1': m(820), 'vault-2': m(450) } })
    expect(clear.take?.candidate.key).toBe('v1')
    expect(clear.choices.map(choice => Math.round(choice.over))).toEqual([320, -50])
    expect(vaultChoices({ pool, combos: sets, results: { 'vault-skip': m(500), 'vault-1': m(560), 'vault-2': m(450) } }).take).toBeNull()
  })

  it('ranks upgrades by clear damage per crest and spends the crests held on the best first', () => {
    const up = (key: string, slot: GearSlot, crests: number) => ({ ...candidate(key, slot, crests, 308, 'upgrade'), upgrade: { track: 'Hero', fromLevel: 305, toLevel: 308, crestId: '3445', crests, gold: 40 } })
    const pool = [up('a', 'head', 20), up('b', 'back', 10), up('c', 'chest', 20)]
    const m = (gain: number) => ({ mean: 0, error: 40, gain })
    const advice = upgradeAdvice({ pool, screen: { a: m(1000), b: m(400), c: m(50) } }, { 3445: 25 })
    expect(advice.map(entry => [entry.candidate.key, entry.clear, entry.affordable])).toEqual([['a', true, true], ['b', true, false], ['c', false, false]])
    expect(upgradeAdvice({ pool, screen: { a: m(1000) } }, null).map(entry => entry.affordable)).toEqual([null])
  })
})
