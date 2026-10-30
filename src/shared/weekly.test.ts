import { describe, expect, it } from 'vite-plus/test'
import { nextDailyReset, nextWeeklyReset, vaultTracks, weekStart, weeklyLockouts, type Weekly } from './weekly'

const at = (iso: string) => Date.parse(iso)
const empty: Weekly = { addon: null, raiderio: null, blizzard: null }

describe('weekly reset schedule', () => {
  it('follows each region\'s published reset day and hour', () => {
    // Tuesday 15:00 UTC in the Americas, Wednesday 04:00 UTC in Europe, Wednesday 23:00 UTC in Asia
    expect(new Date(nextWeeklyReset('us', at('2026-10-20T14:59:00Z'))!).toISOString()).toBe('2026-10-20T15:00:00.000Z')
    expect(new Date(nextWeeklyReset('us', at('2026-10-20T15:00:00Z'))!).toISOString()).toBe('2026-10-27T15:00:00.000Z')
    expect(new Date(nextWeeklyReset('eu', at('2026-10-20T12:00:00Z'))!).toISOString()).toBe('2026-10-21T04:00:00.000Z')
    expect(new Date(nextWeeklyReset('KR', at('2026-10-21T22:00:00Z'))!).toISOString()).toBe('2026-10-21T23:00:00.000Z')
    expect(new Date(nextDailyReset('eu', at('2026-10-20T05:00:00Z'))!).toISOString()).toBe('2026-10-21T04:00:00.000Z')
  })
  it('keeps unknown regions unknown', () => {
    expect(weekStart('xx')).toBeNull()
    expect(nextDailyReset('xx')).toBeNull()
  })
})

describe('Great Vault tracks', () => {
  const now = at('2026-10-22T12:00:00Z')
  const thisWeek = new Date(weekStart('us', now)!).toISOString()
  const lastWeek = new Date(weekStart('us', now)! - 7 * 86_400_000).toISOString()

  it('prefers the addon\'s live vault over provider estimates', () => {
    const weekly: Weekly = {
      ...empty,
      addon: { source: 'addon', observedAt: '2026-10-22T10:00:00.000Z', weekStart: thisWeek, raidKills: [], lockouts: [], runs: [], vault: [
        { kind: 'dungeon', index: 1, threshold: 1, progress: 5, reward: 'Mythic +10' },
        { kind: 'dungeon', index: 2, threshold: 4, progress: 5, reward: 'Mythic +8' },
        { kind: 'dungeon', index: 3, threshold: 8, progress: 5, reward: null },
      ] },
      raiderio: { source: 'Raider.IO', observedAt: '2026-10-22T11:00:00.000Z', weekStart: thisWeek, raidKills: [], lockouts: [], vault: [], runs: [{ dungeon: 'A', level: 12, timed: true, completedAt: null }] },
    }
    const dungeon = vaultTracks(weekly, 'us', now).find(track => track.kind === 'dungeon')!
    expect(dungeon).toMatchObject({ exact: true, progress: 5, remaining: 3, source: 'the in-game Great Vault' })
    expect(dungeon.slots.map(slot => slot.unlocked)).toEqual([true, true, false])
  })

  it('estimates dungeons from Raider.IO runs and raids from Blizzard kills', () => {
    const weekly: Weekly = {
      ...empty,
      raiderio: { source: 'Raider.IO', observedAt: '2026-10-22T11:00:00.000Z', weekStart: thisWeek, raidKills: [], lockouts: [], vault: [], runs: [12, 10, 15, 9].map(level => ({ dungeon: 'A', level, timed: true, completedAt: null })) },
      blizzard: { source: 'Blizzard', observedAt: '2026-10-22T11:00:00.000Z', weekStart: thisWeek, vault: [], runs: [], lockouts: [{ name: 'Raid', difficulty: 'Heroic', killed: 3, total: 8, raid: true }], raidKills: [
        { boss: 'One', difficulty: 'Heroic', rank: 3 }, { boss: 'Two', difficulty: 'Normal', rank: 2 }, { boss: 'Three', difficulty: 'Heroic', rank: 3 },
      ] },
    }
    const [raid, dungeon, world] = vaultTracks(weekly, 'us', now)
    expect(dungeon!.slots.map(slot => slot.reward)).toEqual(['Mythic +15', 'Mythic +9', null])
    expect(dungeon!.exact).toBe(false)
    expect(raid!.slots.map(slot => slot.reward)).toEqual(['Heroic', null, null])
    expect(raid!.remaining).toBe(1)
    expect(world!.progress).toBeNull()
    expect(weeklyLockouts(weekly, 'us', now).lockouts).toHaveLength(1)
  })

  it('ignores snapshots from an earlier reset week', () => {
    const weekly: Weekly = { ...empty, raiderio: { source: 'Raider.IO', observedAt: '2026-10-19T11:00:00.000Z', weekStart: lastWeek, raidKills: [], lockouts: [], vault: [], runs: [{ dungeon: 'A', level: 20, timed: true, completedAt: null }] } }
    expect(vaultTracks(weekly, 'us', now).every(track => track.progress == null)).toBe(true)
  })
})
