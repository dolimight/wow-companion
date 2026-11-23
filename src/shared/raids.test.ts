import { describe, expect, it } from 'vite-plus/test'
import { fullSeasonName, pastRaidSeasons, raidLockouts, raidSlug, raidSummary, seasonRaids, type RaidInfo } from './raids'

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

describe('past raid seasons', () => {
  const now = Date.parse('2026-11-17T00:00:00Z')
  const seasons = [
    { slug: 'season-mn-2', name: 'MN Season 2', startsAt: '2026-08-18T15:00:00Z', endsAt: '2030-01-01T00:00:00Z' },
    { slug: 'season-mn-1', name: 'MN Season 1', startsAt: '2026-03-24T15:00:00Z', endsAt: '2026-08-18T15:00:00Z' },
    { slug: 'season-tww-3', name: 'TWW Season 3', startsAt: '2025-08-12T15:00:00Z', endsAt: '2026-03-02T22:00:00Z' },
    { slug: 'season-event', name: 'Event', startsAt: '2025-06-01T15:00:00Z', endsAt: '2025-06-08T15:00:00Z' },
    { slug: 'season-tww-2', name: 'TWW Season 2', startsAt: '2025-03-04T15:00:00Z', endsAt: '2025-08-12T15:00:00Z' },
    { slug: 'season-tww-1', name: 'TWW Season 1', startsAt: '2024-09-17T15:00:00Z', endsAt: '2025-02-25T15:00:00Z' },
    { slug: 'season-df-4', name: 'DF Season 4', startsAt: '2024-04-23T15:00:00Z', endsAt: '2024-08-26T22:00:00Z' },
    { slug: 'season-sl-4', name: 'SL Season 4', startsAt: '2022-08-02T15:00:00Z', endsAt: '2022-10-25T15:00:00Z' },
  ]
  const raids = [raid('venomous', '2026-08-18T15:00:00Z', 8), raid('tier-mn-1', '2026-03-17T15:00:00Z', 9), raid('sporefall', '2026-06-16T15:00:00Z', 1), raid('manaforge', '2025-08-12T15:00:00Z', 8), raid('undermine', '2025-03-04T15:00:00Z', 8), raid('nerubar', '2024-09-10T15:00:00Z', 8), raid('awakened', '2024-04-30T15:00:00Z', 9), raid('sepulcher', '2022-02-22T15:00:00Z', 11), raid('sepulcher-fated', '2022-08-02T15:00:00Z', 11)]

  it('lists the ended seasons of the last three expansions with their raids, a tier opening a week early included, newest first', () => {
    const past = pastRaidSeasons(raids, seasons, now)
    expect(past.map(season => [season.slug, season.raids.map(entry => entry.slug)])).toEqual([
      ['season-mn-1', ['tier-mn-1', 'sporefall']],
      ['season-tww-3', ['manaforge']],
      ['season-tww-2', ['undermine']],
      ['season-tww-1', ['nerubar']],
      ['season-df-4', ['awakened']],
    ])
    expect(pastRaidSeasons(raids, seasons, now, 1)).toEqual([expect.objectContaining({ slug: 'season-mn-1' })])
  })

  it('names a season in full', () => {
    expect(fullSeasonName('season-tww-3', 'TWW Season 3')).toBe('The War Within Season 3')
    expect(fullSeasonName('season-mn-1', 'MN Season 1')).toBe('Midnight Season 1')
    expect(fullSeasonName('season-xx-1', 'XX Season 1')).toBe('XX Season 1')
  })

  it('makes a slug from a journal name', () => {
    expect(raidSlug("March on Quel'Danas")).toBe('march-on-queldanas')
    expect(raidSlug('The Voidspire')).toBe('the-voidspire')
  })
})
