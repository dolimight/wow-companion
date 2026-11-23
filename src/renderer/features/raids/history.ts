import { useQuery } from '@tanstack/react-query'
import type { RaidHistory, RaidHistoryJournals, RaidInfo, RaidSeason } from '../../../shared/raids'

/** The raids of every ended season in the last three expansions, bundled by scripts/raid-history.ts */
const lists = import.meta.glob<RaidHistory>('../../../../data/raids/history.json', { eager: true, import: 'default' })
export const pastSeasons: RaidSeason[] = Object.values(lists)[0]?.seasons ?? []

/** The past season a raid belongs to, or null for this season's raids */
export function pastRaid(slug: string | undefined): { raid: RaidInfo; season: RaidSeason } | null {
  for (const season of pastSeasons) {
    const raid = season.raids.find(entry => entry.slug === slug)
    if (raid) return { raid, season }
  }
  return null
}

// Their bosses and loot are large, so they load the first time a past raid is shown
const journals = import.meta.glob<RaidHistoryJournals>('../../../../data/raids/encounters/history.json', { import: 'default' })

export function usePastRaidJournals(enabled: boolean) {
  return useQuery({
    queryKey: ['raid-history-journals'],
    queryFn: async () => { const load = Object.values(journals)[0]; return load ? await load() : null },
    enabled,
    staleTime: Infinity,
  })
}
