import { describe, expect, it } from 'vite-plus/test'
import { ago, gearFreshness } from './freshness'

const now = Date.parse('2026-11-20T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString()

describe('gear freshness', () => {
  it('says how long ago in words', () => {
    expect(ago(null, now)).toBe('never')
    expect(ago(hoursAgo(0.5), now)).toBe('30 min ago')
    expect(ago(hoursAgo(5), now)).toBe('5 hr ago')
    expect(ago(hoursAgo(48), now)).toBe('2 days ago')
  })

  it('calls gear fresh within a day, aging within a week, and stale after', () => {
    expect(gearFreshness({ gearObservedAt: hoursAgo(3) }, now).state).toBe('fresh')
    expect(gearFreshness({ gearObservedAt: hoursAgo(60) }, now)).toEqual({ state: 'aging', at: hoursAgo(60), text: 'Gear from 2 days ago' })
    expect(gearFreshness({ gearObservedAt: hoursAgo(24 * 21) }, now).state).toBe('stale')
    expect(gearFreshness({ gearObservedAt: null, observedAt: hoursAgo(2) }, now).state).toBe('fresh')
    expect(gearFreshness({}, now).state).toBe('unknown')
  })
})
