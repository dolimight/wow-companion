import { describe, expect, it } from 'vite-plus/test'
import { diminishing, maxEffective } from './diminishing'

describe('diminishing returns', () => {
  it('gives full value up to 30% and then 90% in the next bracket', () => {
    expect(diminishing(20)).toMatchObject({ raw: 20, lost: 0, bracket: 0, nextValue: 1 })
    expect(diminishing(30)).toMatchObject({ raw: 30, bracket: 1, nextValue: 0.9 })
  })
  it('converts back to the penalty-free percentage inside a bracket', () => {
    // Client curve 21024 maps 40 raw to 39 effective; 40 effective is one point into the next bracket
    const reading = diminishing(40)
    expect(reading.bracket).toBe(2)
    expect(reading.nextValue).toBe(0.8)
    expect(reading.raw).toBeCloseTo(40 + 1 / 0.8, 6)
    expect(reading.lost).toBeCloseTo(reading.raw - 40, 6)
  })
  it('reaches the hard cap at 200 raw and 126 effective', () => {
    expect(maxEffective).toBeCloseTo(126, 6)
    expect(diminishing(126)).toMatchObject({ capped: true, raw: 200, nextValue: 0 })
  })
})
