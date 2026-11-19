import type { Character, GearItem } from '../../shared/domain'
import type { OptimizerMeasure } from '../../shared/optimizer'
import { characterBaselineHash, hash, itemLine } from '../simulation/profiles'

/** A screening result kept for a later run: the piece's gain over what was worn, with the run's baseline */
export type CachedMeasure = OptimizerMeasure & { at: string }
export type ScreenCache = { entries: Record<string, CachedMeasure> }

export const cacheLimit = 2000
export const cacheDays = 14

/**
 * What a screening result depends on: everything equipped and the talents (the baseline hash), the piece exactly as
 * the engine sees it, the fight, the iterations, and the engine itself. Any change to one asks the engine again
 */
export function screenKey(character: Character, items: GearItem[], scenarioId: string, iterations: number, engine: string): string {
  return hash({ baseline: characterBaselineHash(character), items: items.map(item => itemLine(item).text), scenarioId, iterations, engine })
}

/** Drops entries past their age, then the oldest beyond the limit */
export function pruneCache(cache: ScreenCache, now: Date, limit = cacheLimit, days = cacheDays): ScreenCache {
  const cutoff = now.getTime() - days * 86_400_000
  const kept = Object.entries(cache.entries).filter(([, entry]) => Date.parse(entry.at) >= cutoff).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, limit)
  return { entries: Object.fromEntries(kept) }
}
