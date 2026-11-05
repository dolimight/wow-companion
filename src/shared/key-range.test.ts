import { describe, expect, it } from 'vite-plus/test'
import { seasonDungeonSchema, seasonRunsSchema } from './domain'
import { dungeonVerdict, earnedLevel, highestTimed, lowestDungeon, overallVerdict, seasonDungeons, suggestedLevel, timeToSpareMs, upgradesFor } from './key-range'

const minutes = (value: number) => value * 60_000
const dungeon = (name: string, level: number | null, durationMinutes: number | null = 28, extra: Record<string, unknown> = {}) => seasonDungeonSchema.parse({
  dungeon: name, timeLimitMs: minutes(30),
  timed: level == null ? null : { level, durationMs: durationMinutes == null ? null : minutes(durationMinutes) },
  ...extra,
})

describe('key range', () => {
  it('reads keystone upgrades from the run, or from its time against the dungeon timer', () => {
    expect(upgradesFor(dungeon('A', 12, 29))).toBe(1)
    expect(upgradesFor(dungeon('A', 12, 24))).toBe(2)
    expect(upgradesFor(dungeon('A', 12, 18))).toBe(3)
    expect(upgradesFor(seasonDungeonSchema.parse({ dungeon: 'A', timed: { level: 12, upgrades: 2 } }))).toBe(2)
    expect(upgradesFor(seasonDungeonSchema.parse({ dungeon: 'A', timed: { level: 12 } }))).toBeNull()
    expect(earnedLevel(seasonDungeonSchema.parse({ dungeon: 'A', timed: { level: 12 } }))).toBe(13)
    expect(timeToSpareMs(dungeon('A', 12, 24))).toBe(minutes(6))
    expect(upgradesFor(dungeon('A', null))).toBeNull()
  })
  it('counts a level the game would have handed you as within reach, one more as a stretch', () => {
    const twoUp = dungeon('A', 12, 24)
    expect(dungeonVerdict(twoUp, 11)).toBe('timed')
    expect(dungeonVerdict(twoUp, 12)).toBe('timed')
    expect(dungeonVerdict(twoUp, 14)).toBe('reach')
    expect(dungeonVerdict(twoUp, 15)).toBe('stretch')
    expect(dungeonVerdict(twoUp, 16)).toBe('notyet')
    const barely = dungeon('B', 12, 29.5)
    expect(dungeonVerdict(barely, 13)).toBe('reach')
    expect(dungeonVerdict(barely, 14)).toBe('stretch')
    expect(dungeonVerdict(dungeon('C', null, null, { overtime: { level: 14 } }), 10)).toBe('nodata')
  })
  it('takes the verdict reached by at least half of the dungeons with a timed run', () => {
    const dungeons = [dungeon('A', 12, 24), dungeon('B', 12, 29), dungeon('C', 11, 29), dungeon('D', 10, 29), dungeon('E', null)]
    expect(overallVerdict(dungeons, 11)).toMatchObject({ verdict: 'timed', withData: 4 })
    expect(overallVerdict(dungeons, 12).verdict).toBe('timed')
    const thirteen = overallVerdict(dungeons, 13)
    expect(thirteen.verdict).toBe('reach')
    expect(thirteen.counts).toEqual({ timed: 0, reach: 2, stretch: 1, notyet: 1, nodata: 1 })
    expect(overallVerdict(dungeons, 14).verdict).toBe('stretch')
    expect(overallVerdict(dungeons, 16).verdict).toBe('notyet')
    expect(overallVerdict([dungeon('E', null)], 5)).toMatchObject({ verdict: 'nodata', withData: 0 })
    expect(highestTimed(dungeons)).toBe(12)
    expect(lowestDungeon(dungeons)?.dungeon).toBe('D')
    expect(suggestedLevel(dungeons)).toBe(13)
    expect(suggestedLevel([])).toBe(2)
  })
  it('merges sources per dungeon, keeping the higher timed key and where it came from', () => {
    const seasonRuns = seasonRunsSchema.parse({
      addon: { source: 'In-game season bests', observedAt: '2026-11-04T20:00:00.000Z', dungeons: [{ dungeon: 'Ara-Kara, City of Echoes', timeLimitMs: minutes(30), timed: { level: 12, durationMs: minutes(25) } }, { dungeon: 'The Dawnbreaker', timed: null, overtime: { level: 11 } }] },
      raiderio: { source: 'Raider.IO', observedAt: '2026-11-04T10:00:00.000Z', dungeons: [{ dungeon: 'Ara-Kara City of Echoes', timed: { level: 13, upgrades: 1 } }, { dungeon: 'The Dawnbreaker', timed: { level: 10, upgrades: 2 } }] },
    })
    const { dungeons, sources } = seasonDungeons({ seasonRuns })
    expect(sources.map(source => source.source)).toEqual(['In-game season bests', 'Raider.IO'])
    expect(dungeons).toHaveLength(2)
    expect(dungeons[0]).toMatchObject({ dungeon: 'Ara-Kara, City of Echoes', timeLimitMs: minutes(30), timed: { level: 13, upgrades: 1 }, source: 'Raider.IO' })
    expect(dungeons[1]).toMatchObject({ timed: { level: 10 }, overtime: { level: 11 }, source: 'Raider.IO' })
    expect(seasonDungeons({ seasonRuns: seasonRunsSchema.parse({}) }).dungeons).toEqual([])
  })
})
