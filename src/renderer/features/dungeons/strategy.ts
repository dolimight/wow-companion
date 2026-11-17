import type { DungeonStrategy, StrategyFile } from '../../../shared/dungeons'

/** Strategy written for each season's dungeons, bundled from data/dungeons/strategy */
const files = import.meta.glob<StrategyFile>('../../../../data/dungeons/strategy/*.json', { eager: true, import: 'default' })
const byDungeon = new Map<string, DungeonStrategy>(Object.values(files).flatMap(file => file?.dungeons ?? []).map(entry => [entry.dungeon, entry]))

export function dungeonStrategy(slug: string): DungeonStrategy | null {
  return byDungeon.get(slug) ?? null
}
