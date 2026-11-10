import { describe, expect, it } from 'vite-plus/test'
import { flatEnhancement, scoreEnhancement, zeroRatings, equalWeights } from './enhancement-recommendations'
import { effectiveFromRaw } from './diminishing'

describe('enhancement recommendations', () => {
  it('uses the installed client curve at every secondary-stat breakpoint', () => {
    for (const [raw, effective] of [[30,30],[40,39],[50,47],[60,54],[80,66],[100,76],[200,126]]) expect(effectiveFromRaw(raw!)).toBeCloseTo(effective!)
  })
  it('parses dual-stat gems without scoring proc or hybrid effects as guaranteed gains', () => {
    expect(flatEnhancement('+120 Haste and +60 Mastery')).toEqual({ ...zeroRatings(), haste: 120, mastery: 60 })
    for (const text of ['Chance to gain 120 Haste', '+120 Haste for 10 sec', '+120 Haste and +30 Strength', '+10% Haste', 'Unknown', '-10 Haste']) expect(flatEnhancement(text)).toBeNull()
  })
  it('subtracts a replaced enchant and crosses brackets using the full plan delta', () => {
    const score = scoreEnhancement({ haste: { raw: 29, perPoint: 100 } }, { ...zeroRatings(), haste: 100 }, { ...zeroRatings(), haste: 50 }, { ...zeroRatings(), haste: 250 }, equalWeights)!
    expect(score.score).toBeCloseTo(180)
    expect(score.changes[0]!.effective).toBeCloseTo(1.8)
  })
  it('lets weights outweigh a DR penalty and recomputes after another selection', () => {
    const conversions = { haste: { raw: 30, perPoint: 100 }, crit: { raw: 10, perPoint: 100 } }
    const haste = scoreEnhancement(conversions, zeroRatings(), zeroRatings(), { ...zeroRatings(), haste: 100 }, { ...equalWeights, haste: 2 })!
    const crit = scoreEnhancement(conversions, zeroRatings(), zeroRatings(), { ...zeroRatings(), crit: 100 }, equalWeights)!
    expect(haste.score).toBeGreaterThan(crit.score)
    expect(scoreEnhancement(conversions, { ...zeroRatings(), haste: 2000 }, zeroRatings(), { ...zeroRatings(), haste: 100 }, equalWeights)!.score).toBeCloseTo(70)
  })
  it('does not guess missing conversions or impossible negative totals', () => {
    expect(scoreEnhancement({}, zeroRatings(), zeroRatings(), { ...zeroRatings(), mastery: 100 }, equalWeights)).toBeNull()
    expect(scoreEnhancement({ haste: { raw: 1, perPoint: 100 } }, zeroRatings(), { ...zeroRatings(), haste: 200 }, zeroRatings(), equalWeights)).toBeNull()
  })
})
