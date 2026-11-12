import { describe, expect, it } from 'vite-plus/test'
import { simulationCharacter, topFixture } from '../main/simulation/fixtures'
import { benchmarkPlan, benchmarkReading, planSwaps } from './simulation-benchmark'


describe('top player benchmark', () => {
  it('swaps in the most worn items at their level, keeps yours where you match, and adds the popular build', () => {
    const plan = benchmarkPlan(simulationCharacter(), topFixture())
    expect(plan.gear.map(item => [item.slot, item.itemId, item.itemLevel])).toEqual([['head', 2000, 112], ['finger1', 2010, 111]])
    // Your enchants and gems ride along, and the constructed item is fully described to the engine
    expect(plan.gear[0]).toMatchObject({ enchantId: 0, bonusIds: [], itemLink: null, variantCoverage: 'complete', inventoryType: 1 })
    expect(plan.talents).toBe('TOPBUILD123')
    expect(plan.kinds).toEqual(['gear', 'talents', 'both'])
    expect(plan.skipped).toEqual(expect.arrayContaining(['Trinkets: the item level top players wear is unknown', 'Trinkets: not enough top players share a second item']))
  })
  it('runs each item at the highest level any sampled player wears it, not the most common one', () => {
    const top = topFixture()
    top.slots.head!.items[0] = { ...top.slots.head!.items[0]!, level: 112, levelRange: { min: 109, max: 115 } }
    expect(benchmarkPlan(simulationCharacter(), top).gear.find(item => item.slot === 'head')?.itemLevel).toBe(115)
    // Ascension levels past the regular upgrade ranks are capped, since few players ever reach them
    expect(benchmarkPlan(simulationCharacter(), top, 113).gear.find(item => item.slot === 'head')?.itemLevel).toBe(113)
    expect(benchmarkPlan(simulationCharacter(), top, 200).gear.find(item => item.slot === 'head')?.itemLevel).toBe(115)
  })
  it('skips talents you already use or that too few players share', () => {
    const character = simulationCharacter()
    expect(benchmarkPlan(character, topFixture({ builds: [{ loadout: character.talents!.loadout, count: 6, players: [] }] })).talents).toBeNull()
    expect(benchmarkPlan(character, topFixture({ builds: [{ loadout: 'RARE', count: 1, players: [] }] })).kinds).toEqual(['gear'])
    expect(benchmarkPlan(character, topFixture({ builds: [{ loadout: 'bad loadout;', count: 9, players: [] }] })).talents).toBeNull()
  })
  it('reads how much of the top setup yours reaches, calling a gap inside the uncertainty a match', () => {
    expect(benchmarkReading({ mean: 90_000, standardError: 100 }, [{ kind: 'gear', value: { mean: 100_000, standardError: 100 } }])).toEqual({ share: 0.9, matches: false, best: 'gear' })
    expect(benchmarkReading({ mean: 99_900, standardError: 100 }, [{ kind: 'gear', value: { mean: 100_000, standardError: 100 } }]).matches).toBe(true)
    expect(benchmarkReading({ mean: 101_000, standardError: 100 }, [{ kind: 'talents', value: { mean: 100_000, standardError: 100 } }])).toMatchObject({ share: 1, matches: true })
  })
})

describe('plan swaps', () => {
  it('describes planned items by id and level with your enchant and gems, and leaves items you already wear alone', () => {
    const character = simulationCharacter()
    const exact = '|Hitem:3000::::::::90:250::55:1:6652::::::|h[Exact ring]|h'
    const { swaps, skipped } = planSwaps(character, [
      { ...character.gear[0]!, itemId: 2000, name: 'Planned helm', itemLevel: 120, itemLink: null, bonusIds: null },
      { ...character.gear[1]! },
      { ...character.gear[2]!, itemLevel: 130 },
      { ...character.gear[10]!, itemId: 3000, name: 'Exact ring', itemLevel: 125, itemLink: exact },
      { ...character.gear[3]!, itemId: 4000, name: 'Unknown level cloak', itemLevel: null },
    ])
    expect(swaps.map(item => [item.slot, item.itemId, item.itemLevel])).toEqual([['head', 2000, 120], ['shoulder', 1002, 130], ['finger1', 3000, 125]])
    expect(swaps[0]).toMatchObject({ bonusIds: [], enchantId: 0, variantCoverage: 'complete' })
    expect(swaps[2]!.itemLink).toBe(exact)
    expect(skipped).toEqual(['Cloak: the planned item level is unknown'])
  })
})
