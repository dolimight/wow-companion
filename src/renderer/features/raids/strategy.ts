import type { RaidStrategy, RaidStrategyFile } from '../../../shared/raids'

/** Strategy written for each season's raids, bundled from data/raids/strategy */
const files = import.meta.glob<RaidStrategyFile>('../../../../data/raids/strategy/*.json', { eager: true, import: 'default' })
const byRaid = new Map<string, RaidStrategy>(Object.values(files).flatMap(file => file?.raids ?? []).map(entry => [entry.raid, entry]))

export function raidStrategy(slug: string): RaidStrategy | null {
  return byRaid.get(slug) ?? null
}
