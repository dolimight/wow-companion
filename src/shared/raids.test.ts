import { describe, expect, it } from 'vite-plus/test'
import { raidLockouts, raidSummary, seasonRaids, type RaidInfo } from './raids'

const raid = (slug: string, startsAt: string | null, bosses: number): RaidInfo => ({ slug, name: slug, shortName: slug, startsAt, encounters: Array.from({ length: bosses }, (_, at) => ({ slug: `${slug}-${at}`, name: `Boss ${at}` })) })

describe('season raids', () => {
  const now = Date.parse('2026-11-17T00:00:00Z')
  it('keeps the newest full tier and the lairs opened since, tier first', () => {
    const list = seasonRaids([raid('old-tier', '2026-03-17T15:00:00Z', 9), raid('old-lair', '2026-06-16T15:00:00Z', 1), raid('lair', '2026-08-18T15:00:00Z', 1), raid('tier', '2026-08-18T15:00:00Z', 8), raid('late-lair', '2026-10-13T15:00:00Z', 1), raid('future', '2027-01-01T00:00:00Z', 8)], now)
    expect(list.map(entry => entry.slug)).toEqual(['tier', 'lair', 'late-lair'])
  })
  it('falls back to every open raid when no full tier has opened', () => {
    expect(seasonRaids([raid('lair', '2026-08-18T15:00:00Z', 1), raid('unscheduled', null, 1)], now).map(entry => entry.slug)).toEqual(['lair'])
  })
})

describe('raid progress', () => {
  it("reads one raid's summary from the raiding label", () => {
    const label = 'the-venomous-abyss: 3/8 H · the-tidebound-grotto: 1/1 N'
    expect(raidSummary(label, 'the-venomous-abyss')).toBe('3/8 H')
    expect(raidSummary(label, 'the-tidebound-grotto')).toBe('1/1 N')
    expect(raidSummary(label, 'the-unbinding-of-kithix')).toBeNull()
    expect(raidSummary(null, 'the-venomous-abyss')).toBeNull()
  })
  it("matches this week's lockouts by raid name, skipping dungeons", () => {
    const lockouts = [{ name: 'The Venomous Abyss', difficulty: 'Heroic', killed: 3, total: 8, raid: true }, { name: 'Kings\' Rest', difficulty: 'Mythic', killed: 4, total: 4, raid: false }]
    expect(raidLockouts(lockouts, 'The Venomous Abyss')).toEqual([lockouts[0]])
    expect(raidLockouts(lockouts, "Kings' Rest")).toEqual([])
  })
})
