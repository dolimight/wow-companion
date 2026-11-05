import { expect, it } from 'vite-plus/test'
import { latestKeystoneSeason, parseKeystoneSeason } from './blizzard'

const timer = (minutes: number) => ({ keystone_upgrades: [{ upgrade_level: 1, qualifying_duration: minutes * 60_000 }, { upgrade_level: 2, qualifying_duration: minutes * 48_000 }, { upgrade_level: 3, qualifying_duration: minutes * 36_000 }] })

it('reads each dungeon best timed and overtime key with the upgrades its time earned', () => {
  const season = { best_runs: [
    { keystone_level: 12, duration: 24 * 60_000, is_completed_within_time: true, completed_timestamp: Date.parse('2026-11-03T20:00:00Z'), dungeon: { id: 1, name: 'Fixture Halls' } },
    { keystone_level: 14, duration: 34 * 60_000, is_completed_within_time: false, dungeon: { id: 1, name: 'Fixture Halls' } },
    { keystone_level: 9, duration: 29 * 60_000, is_completed_within_time: true, dungeon: { id: 2, name: 'Fixture Vault' } },
    { keystone_level: 1, duration: 10 * 60_000, is_completed_within_time: true, dungeon: { id: 3, name: 'Out of range' } },
  ] }
  const snapshot = parseKeystoneSeason(season, { 1: timer(30), 2: timer(30) }, '2026-11-04T12:00:00.000Z')
  expect(snapshot).toEqual({ source: 'Blizzard', observedAt: '2026-11-04T12:00:00.000Z', dungeons: [
    { dungeon: 'Fixture Halls', timeLimitMs: 1_800_000, timed: { level: 12, durationMs: 1_440_000, upgrades: 2, completedAt: '2026-11-03T20:00:00.000Z' }, overtime: { level: 14, durationMs: 2_040_000 } },
    { dungeon: 'Fixture Vault', timeLimitMs: 1_800_000, timed: { level: 9, durationMs: 1_740_000, upgrades: 1, completedAt: null }, overtime: null },
  ] })
})
it('leaves upgrades unknown without a dungeon timer and returns nothing for an empty season', () => {
  const snapshot = parseKeystoneSeason({ best_runs: [{ keystone_level: 10, duration: 20 * 60_000, is_completed_within_time: true, dungeon: { id: 4, name: 'Untimed data' } }] }, {}, '2026-11-04T12:00:00.000Z')
  expect(snapshot?.dungeons[0]).toMatchObject({ timeLimitMs: null, timed: { level: 10, upgrades: null } })
  expect(parseKeystoneSeason({ best_runs: [] }, {}, '2026-11-04T12:00:00.000Z')).toBeNull()
  expect(parseKeystoneSeason(null, {}, '2026-11-04T12:00:00.000Z')).toBeNull()
  expect(latestKeystoneSeason({ seasons: [{ id: 15 }, { id: 17 }, { id: 16 }] })).toBe(17)
  expect(latestKeystoneSeason({})).toBeNull()
})
