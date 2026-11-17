import { useQuery } from '@tanstack/react-query'
import type { DungeonJournal, EncounterBundle, EnemySpell, JournalDifficulty } from '../../../shared/dungeons'
import { api } from '../../lib/client'
import { useGameData } from '../items/items'

/** Boss text, loot, and enemy spells bundled from data/dungeons/encounters by scripts/encounter-data.ts, newest first */
const files = import.meta.glob<EncounterBundle>('../../../../data/dungeons/encounters/season-*.json', { eager: true, import: 'default' })
const bundles = Object.values(files).filter(Boolean).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))

export function bundledDungeon(slug: string): DungeonJournal | null {
  for (const bundle of bundles) if (bundle.dungeons[slug]) return bundle.dungeons[slug]!
  return null
}

export function bundledRaid(slug: string): Partial<Record<JournalDifficulty, DungeonJournal>> | null {
  for (const bundle of bundles) if (bundle.raids[slug]) return bundle.raids[slug]!
  return null
}

const spells: Record<number, EnemySpell> = Object.assign({}, ...[...bundles].reverse().map(bundle => bundle.spells))
export const bundledSpell = (id: number): EnemySpell | undefined => spells[id]

type JournalResult = { data: DungeonJournal | null | undefined; isPending: boolean; isError: boolean; error: unknown }

/**
 * A journal from the bundle; only an instance the bundle lacks, such as a dungeon added after the app was built, is read
 * from the player's game files
 */
export function useEncounterJournal(key: string, packed: DungeonJournal | null | undefined, read: () => Promise<DungeonJournal | null>): JournalResult {
  const ready = useGameData().data?.state === 'ready'
  const live = useQuery({ queryKey: ['encounter-journal', key], queryFn: read, enabled: ready && !packed, staleTime: Infinity })
  return packed ? { data: packed, isPending: false, isError: false, error: null } : live
}

export const useDungeonJournal = (slug: string, name: string, encounterIds: number[] = []) =>
  useEncounterJournal(`dungeon:${slug}:${encounterIds.join(',')}`, bundledDungeon(slug), () => api.dungeonJournal(name, encounterIds))
