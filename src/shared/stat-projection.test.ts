import { describe, expect, it } from 'vite-plus/test'
import type { CharacterStats } from './domain'
import { effectiveFromRaw } from './diminishing'
import { projectStats, zeroDelta } from './stat-projection'

const sheet = (patch: Partial<CharacterStats> = {}): CharacterStats => ({
  primary: { name: 'Strength', value: 10_000 }, stamina: 50_000, health: 1_000_000,
  crit: 25, haste: 20, mastery: 40, versatility: 10,
  ratings: { crit: 4_000, haste: 3_000, mastery: 2_000, versatility: 1_500 },
  ratingBonus: { crit: 20, haste: 15, mastery: 12, versatility: 10 },
  source: 'Blizzard', observedAt: null, ...patch,
})

describe('projecting a plan onto the character sheet', () => {
  it('leaves the sheet alone when nothing changes', () => {
    const before = sheet()
    const { stats, unknown } = projectStats(before, zeroDelta())
    expect(stats).toEqual(before)
    expect(unknown).toEqual([])
  })

  it('moves main stat and stamina, and health at the sheet’s own ratio', () => {
    const { stats } = projectStats(sheet(), { ...zeroDelta(), primary: 250, stamina: 1_000 })
    expect(stats.primary?.value).toBe(10_250)
    expect(stats.stamina).toBe(51_000)
    expect(stats.health).toBe(1_020_000)
  })

  it('adds rating linearly below the first penalty', () => {
    const delta = zeroDelta()
    delta.ratings.crit = 400 // 200 rating per percent, so 2%
    const { stats } = projectStats(sheet(), delta)
    expect(stats.crit).toBeCloseTo(27, 6)
    expect(stats.ratings?.crit).toBe(4_400)
  })

  it('applies diminishing returns once rating crosses 30%', () => {
    const delta = zeroDelta()
    delta.ratings.crit = 4_000 // raw 20% to 40%
    const { stats } = projectStats(sheet(), delta)
    expect(stats.crit).toBeCloseTo(25 + effectiveFromRaw(40) - 20, 6)
    expect(stats.crit).toBeLessThan(45)
  })

  it('scales mastery points by the specialization’s sheet scale', () => {
    // Synced from a Blood Death Knight: 8 base points × 2 + 22.96 from 528 rating
    const before = sheet({ mastery: 38.96, ratings: { crit: 4_000, haste: 3_000, mastery: 528, versatility: 1_500 }, ratingBonus: { crit: 20, haste: 15, mastery: 22.96, versatility: 10 } })
    const delta = zeroDelta()
    delta.ratings.mastery = 528 // 11.48 to 22.96 points, all below the first penalty
    const { stats } = projectStats(before, delta)
    expect(stats.mastery).toBeCloseTo(38.96 + 22.96, 6)
    delta.ratings.mastery = 1_056 // 34.44 points, partly past 30
    expect(projectStats(before, delta).stats.mastery).toBeCloseTo(16 + effectiveFromRaw(34.44) * 2, 4)
  })

  it('reports stats it can’t convert instead of guessing', () => {
    const delta = zeroDelta()
    delta.ratings.haste = 500
    const { stats, unknown } = projectStats(sheet({ ratingBonus: null }), delta)
    expect(unknown).toEqual(['haste'])
    expect(stats.haste).toBe(20)
    expect(stats.ratings?.haste).toBe(3_500)
  })
})
