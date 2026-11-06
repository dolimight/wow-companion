import { describe, expect, it } from 'vite-plus/test'
import { characterSchema, gearItemSchema, seasonDungeonSchema } from './domain'
import { crestPlan, upgradeTrackOf } from './crest-plan'
import { comfortableLevel, tonightKeys } from './key-range'
import { dungeonVaultPlan } from './vault-plan'
import { appendTimeline, timelinePoint } from './timeline'
import { newSeasonBests, vaultReadyAlerts } from './alerts'
import type { VaultTrack } from './weekly'

const minutes = (value: number) => value * 60_000
const dungeon = (name: string, level: number | null, duration = 28) => seasonDungeonSchema.parse({ dungeon: name, timeLimitMs: minutes(30), timed: level == null ? null : { level, durationMs: minutes(duration) } })
const character = (extra: Record<string, unknown> = {}) => characterSchema.parse({ id: 'c1', region: 'us', realm: 'Area 52', name: 'Fixture', ...extra })
const runs = (dungeons: unknown[]) => ({ addon: { source: 'In-game season bests', observedAt: '2026-11-04T12:00:00.000Z', dungeons } })

describe('tonight keys', () => {
  it('picks the lowest dungeons first, one level up while that stays within reach', () => {
    const dungeons = [dungeon('A', 10, 29), dungeon('B', 8, 24), dungeon('C', 12, 29), dungeon('D', null)]
    expect(comfortableLevel(dungeons)).toBe(11)
    const picks = tonightKeys(dungeons)
    expect(picks.map(pick => [pick.dungeon, pick.level])).toEqual([['D', 11], ['B', 10], ['A', 11], ['C', 13]])
    expect(picks[1]!.verdict).toBe('reach')
  })
})

describe('vault plan', () => {
  const track = (progress: number, unlocked: number): VaultTrack => ({ kind: 'dungeon', label: 'Dungeons', progress, source: 'x', exact: true, remaining: null, note: null, slots: [1, 4, 8].map((threshold, index) => ({ threshold, unlocked: index < unlocked, reward: null })) })
  it('counts keys at the target level for each choice', () => {
    const steps = dungeonVaultPlan(track(5, 2), [12, 10, 10, 8, 7], 10)
    expect(steps[0]!.text).toBe('1st choice unlocked at +12')
    expect(steps[1]!.text).toBe('2nd choice is +8. 1 more key at +10 or higher would raise it to +10')
    expect(steps[2]!.text).toBe('5 more keys at +10 or higher unlock the 3rd choice as a +10 reward')
  })
  it('stays empty without observed progress', () => {
    expect(dungeonVaultPlan({ ...track(0, 0), progress: null }, [], 10)).toEqual([])
  })
})

describe('crest plan', () => {
  const tracks = [{ id: 't', name: 'Hero', ranks: [1, 2, 3].map(rank => ({ rank, itemLevel: 270 + rank * 3, cost: rank === 1 ? [] : [{ currencyId: '3445', amount: rank === 2 ? 15 : 20 }, { currencyId: 'money', amount: 100000 }], discountRequired: true })) }]
  it('ranks next upgrades by item level per crest and spends only crests you hold', () => {
    const gear = [
      gearItemSchema.parse({ slot: 'head', itemId: 1, name: 'Helm', itemLevel: 273, upgradeTrackId: 't', upgradeRank: 1 }),
      gearItemSchema.parse({ slot: 'chest', itemId: 2, name: 'Robe', itemLevel: 276, upgradeTrackId: 't', upgradeRank: 2 }),
      gearItemSchema.parse({ slot: 'feet', itemId: 3, name: 'Boots', itemLevel: 250 }),
    ]
    const plan = crestPlan(gear, tracks, { '3445': 20 })
    expect(plan.steps.map(step => [step.slot, step.crests])).toEqual([['head', 15], ['chest', 20]])
    expect(plan.affordable.map(step => step.slot)).toEqual(['head'])
    expect(plan.totals).toEqual([{ currencyId: '3445', balance: 20, next: 35, full: 55 }])
    expect(plan.unknownSlots).toEqual(['feet'])
    expect(plan.steps[0]!.gold).toBe(10)
  })
  it('reads the track from a single matching bonus ID', () => {
    expect(upgradeTrackOf({ bonusIds: [12817], itemLevel: 266, upgradeTrackId: null, upgradeRank: null })).toEqual({ trackId: 'client-group-614', rank: 1 })
    expect(upgradeTrackOf({ bonusIds: [12817], itemLevel: 270, upgradeTrackId: null, upgradeRank: null })).toBeNull()
  })
})

describe('timeline', () => {
  it('records a point only when something changed', () => {
    const point = timelinePoint(character({ itemLevel: 280.44, ratings: { mythicPlus: { value: 2100, label: 'Mythic+ score', seasonId: 's2' } } }), '2026-11-04T12:00:00.000Z')
    expect(point).toEqual({ at: '2026-11-04T12:00:00.000Z', itemLevel: 280.4, score: 2100, season: 's2' })
    const first = appendTimeline(null, point)!
    expect(appendTimeline(first, { ...point, at: '2026-11-05T12:00:00.000Z' })).toBeNull()
    expect(appendTimeline(first, { ...point, at: '2026-11-05T12:00:00.000Z', score: 2150 })!.points).toHaveLength(2)
    expect(appendTimeline(null, { ...point, itemLevel: null, score: null })).toBeNull()
  })
})

describe('alerts', () => {
  it('reports a raised season best but not a first sighting', () => {
    const before = character({ seasonRuns: runs([dungeon('A', 10)]) })
    const after = character({ seasonRuns: runs([dungeon('A', 12), dungeon('B', 9)]) })
    expect(newSeasonBests(before, after).map(alert => alert.body)).toEqual(['Timed +12 A, up from +10', 'Timed +9 B'])
    expect(newSeasonBests(character(), after)).toEqual([])
  })
  it('announces vault rewards from last week after the reset', () => {
    const weekly = { addon: { source: 'addon', observedAt: '2026-11-02T12:00:00.000Z', weekStart: '2026-10-27T15:00:00.000Z', vault: [{ kind: 'dungeon', index: 1, threshold: 1, progress: 2 }, { kind: 'dungeon', index: 2, threshold: 4, progress: 2 }] } }
    const alerts = vaultReadyAlerts([character({ weekly })], Date.parse('2026-11-03T16:00:00Z'))
    expect(alerts).toEqual([{ key: 'vault:c1:2026-11-03T15:00:00.000Z', characterId: 'c1', title: "Fixture's Great Vault is ready", body: '1 reward to choose from after the weekly reset' }])
  })
})

describe('top player comparison', () => {
  it('lists slots most top players enchant that you left empty, and names the population', async () => {
    const { compareWithTop } = await import('./top-compare')
    const top = { season: { slug: 's', name: 'S' }, specId: 1, specName: 'Frost', className: 'Mage', region: 'us' as const, observedAt: '2026-11-04T12:00:00.000Z', runsScanned: 0, source: 'Raider.IO', population: '', players: [], builds: [], gearPlayers: 10, averageItemLevel: 285.2,
      slots: { legs: { items: [], enchants: [{ id: 1, name: 'Spellthread', count: 9 }], gems: [] }, rings: { items: [], enchants: [{ id: 2, name: 'Radiant Mastery', count: 18 }], gems: [] }, wrist: { items: [], enchants: [{ id: 3, name: 'Avoidance', count: 3 }], gems: [] } } }
    const gear = [
      gearItemSchema.parse({ slot: 'legs', name: 'Legs', enchantCoverage: 'complete' }),
      gearItemSchema.parse({ slot: 'finger1', name: 'Ring', enchant: 'Radiant Mastery', enchantCoverage: 'complete' }),
      gearItemSchema.parse({ slot: 'finger2', name: 'Ring', enchantCoverage: 'complete' }),
      gearItemSchema.parse({ slot: 'wrist', name: 'Wrist', enchantCoverage: 'complete' }),
    ]
    const result = compareWithTop(gear, 280, top)!
    expect(result.population).toBe('10 top Frost Mage players on Raider.IO, North America')
    expect(result.itemLevel).toEqual({ yours: 280, average: 285.2 })
    expect(result.enchantGaps.map(gap => gap.label)).toEqual(['Legs', 'Rings (second)'])
    expect(result.enchantSlotsChecked).toBe(3)
  })
})
