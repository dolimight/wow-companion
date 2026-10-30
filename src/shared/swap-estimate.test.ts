import { describe, expect, it } from 'vite-plus/test'
import { effectiveFromRaw, diminishing } from './diminishing'
import { estimateSwap } from './swap-estimate'
import type { CharacterStats } from './domain'

const line = (text: string, secondary = false) => ({ text, secondary })
const stats = (patch: Partial<CharacterStats>): CharacterStats => ({ primary: null, stamina: null, health: null, crit: null, haste: null, mastery: null, versatility: null, ratings: null, ratingBonus: null, source: 'Blizzard', observedAt: null, ...patch })

describe('diminishing returns forward and back', () => {
  it('round-trips through the brackets', () => {
    for (const effective of [10, 30, 35, 41, 50, 60]) expect(effectiveFromRaw(diminishing(effective).raw)).toBeCloseTo(effective, 6)
    expect(effectiveFromRaw(39)).toBeCloseTo(38.1, 6)
  })
})

describe('swap estimate', () => {
  const mine = { lines: [line('+1000 Agility'), line('+400 Haste', true)], baseLines: [line('+500 Agility'), line('+200 Haste', true)], level: 300, baseLevel: 250 }

  it('needs your upgraded stats to learn how the item scales', () => {
    expect(estimateSwap({ stats: null, mine: { ...mine, lines: [] }, top: { lines: [], level: 300, baseLevel: 250 } })).toBeNull()
  })

  it('scales the other item, applies diminishing returns, and calls a clear upgrade better', () => {
    const result = estimateSwap({
      stats: stats({ haste: 20, ratings: { crit: null, haste: 1000, mastery: null, versatility: null }, ratingBonus: { crit: null, haste: 20, mastery: null, versatility: null } }),
      mine,
      top: { lines: [line('+550 Agility'), line('+250 Haste', true)], level: 300, baseLevel: 250 },
    })!
    // Same item level as yours, so both items scale alike: more agility and more haste
    expect(result.rows.find((row) => row.name === 'Agility')!.delta).toBeGreaterThan(0)
    expect(result.verdict).toBe('better')
    const haste = result.dr.find((entry) => entry.name === 'Haste')!
    expect(haste.after).toBeGreaterThan(haste.before)
  })

  it('flags a gain that lands in a penalty bracket and counts only what survives', () => {
    const result = estimateSwap({
      stats: stats({ haste: 29, ratings: { crit: null, haste: 2900, mastery: null, versatility: null }, ratingBonus: { crit: null, haste: 29, mastery: null, versatility: null } }),
      mine,
      top: { lines: [line('+500 Agility'), line('+700 Haste', true)], level: 300, baseLevel: 250 },
    })!
    const haste = result.dr.find((entry) => entry.name === 'Haste')!
    expect(haste.bracketAfter).toBeGreaterThan(haste.bracketBefore)
    expect(haste.kept).toBeLessThan(1)
    expect(result.reasons.some((reason) => /penalty bracket/.test(reason))).toBe(true)
  })

  it('calls a swap that loses main stat and secondary percentage worse', () => {
    const result = estimateSwap({
      stats: stats({ haste: 20, ratings: { crit: null, haste: 1000, mastery: null, versatility: null }, ratingBonus: { crit: null, haste: 20, mastery: null, versatility: null } }),
      mine,
      top: { lines: [line('+400 Agility'), line('+100 Haste', true)], level: 300, baseLevel: 250 },
    })!
    expect(result.verdict).toBe('worse')
  })
})
