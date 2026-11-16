import type { DungeonBundle, DungeonList } from '../shared/dungeons'

/** Every season bundled by scripts/dungeon-data.ts; a new season's file is picked up without code changes */
const files = import.meta.glob<DungeonBundle>('../../data/dungeons/*.json', { eager: true, import: 'default' })
const bundles = Object.values(files).filter(bundle => bundle?.season?.slug && Array.isArray(bundle.dungeons))

/**
 * The bundled season to use now: the newest one that has not ended. Once it ends (or when nothing is bundled) the app
 * asks Raider.IO for the live season instead
 */
export function currentBundle(now = Date.now(), all: DungeonBundle[] = bundles): DungeonBundle | null {
  return [...all].filter(bundle => !bundle.season.endsAt || Date.parse(bundle.season.endsAt) > now)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] ?? null
}

export function bundledList(bundle: DungeonBundle): DungeonList {
  return {
    season: bundle.season,
    dungeons: bundle.dungeons.map(({ routes: _routes, enemies: _enemies, ...dungeon }) => dungeon),
    observedAt: bundle.generatedAt,
    source: 'Bundled from Raider.IO',
  }
}
