import { describe, expect, it } from 'vite-plus/test'
import { simulationCharacter, topFixture } from '../main/simulation/fixtures'
import { benchmarkPlan, benchmarkReading } from './simulation-benchmark'


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
