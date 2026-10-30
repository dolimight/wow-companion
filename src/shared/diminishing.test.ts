import { describe, expect, it } from 'vite-plus/test'
import { diminishing, maxEffective } from './diminishing'

describe('diminishing returns', () => {
  it('gives full value up to 30% and then 90% in the next bracket', () => {
    expect(diminishing(20)).toMatchObject({ raw: 20, lost: 0, bracket: 0, nextValue: 1 })
    expect(diminishing(30)).toMatchObject({ raw: 30, bracket: 1, nextValue: 0.9 })
  })
  it('converts back to the penalty-free percentage inside a bracket', () => {
    // 30 to 39 raw keeps 90%, so 38.1 is the effective value at 39 raw; 40 is 1.9 into the 80% bracket
    const reading = diminishing(40)
    expect(reading.bracket).toBe(2)
    expect(reading.nextValue).toBe(0.8)
    expect(reading.raw).toBeCloseTo(39 + 1.9 / 0.8, 6)
    expect(reading.lost).toBeCloseTo(reading.raw - 40, 6)
  })
  it('reaches the hard cap at 126% raw', () => {
    expect(maxEffective).toBeCloseTo(86.6, 6)
    expect(diminishing(90)).toMatchObject({ capped: true, raw: 126, nextValue: 0 })
  })
})
