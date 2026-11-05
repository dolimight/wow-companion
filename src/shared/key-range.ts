import type { Character, SeasonDungeon } from './domain'

/**
 * Key range answers "is this character ready for +N" from the character's own season bests only.
 * The game's keystone upgrade is the anchor: timing a key with 20% or 40% of the timer left hands you
 * a key two or three levels higher, so a level the game would have given you counts as within reach.
 * Comparisons with other players need a population source the app does not have yet, so none is made
 */
export type KeyVerdict = 'timed' | 'reach' | 'stretch' | 'notyet' | 'nodata'
export type DungeonBest = SeasonDungeon & { source: string; observedAt: string }
export const keyLevels = { min: 2, max: 20 } as const
export const verdictLabels: Record<KeyVerdict, string> = { timed: "You've timed it", reach: 'Within reach', stretch: 'Stretch', notyet: 'Not yet', nodata: 'No timed run yet' }
const rank: Record<Exclude<KeyVerdict, 'nodata'>, number> = { timed: 0, reach: 1, stretch: 2, notyet: 3 }
const byRank = ['timed', 'reach', 'stretch', 'notyet'] as const

const dungeonKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const better = <T extends { level: number; durationMs?: number | null }>(a: T | null, b: T | null) => {
  if (!a) return b
  if (!b) return a
  if (a.level !== b.level) return a.level > b.level ? a : b
  return (a.durationMs ?? Infinity) <= (b.durationMs ?? Infinity) ? a : b
}

/** Season bests from every source, merged per dungeon; a higher timed key always wins */
export function seasonDungeons(character: Pick<Character, 'seasonRuns'>) {
  const snapshots = [character.seasonRuns.addon, character.seasonRuns.blizzard, character.seasonRuns.raiderio].filter(value => value != null)
  const merged = new Map<string, DungeonBest>()
  for (const snapshot of snapshots) for (const dungeon of snapshot.dungeons) {
    const key = dungeonKey(dungeon.dungeon), current = merged.get(key)
    if (!current) { merged.set(key, { ...dungeon, source: snapshot.source, observedAt: snapshot.observedAt }); continue }
    const timed = better(current.timed, dungeon.timed)
    merged.set(key, {
      ...current,
      timeLimitMs: current.timeLimitMs ?? dungeon.timeLimitMs,
      timed,
      overtime: better(current.overtime, dungeon.overtime),
      ...(timed !== current.timed ? { source: snapshot.source, observedAt: snapshot.observedAt } : {}),
    })
  }
  const dungeons = [...merged.values()].sort((a, b) => a.dungeon.localeCompare(b.dungeon))
  return { dungeons, sources: snapshots.map(({ source, observedAt }) => ({ source, observedAt })) }
}

/** Keystone upgrades from the run itself, or from its duration against the dungeon timer */
export function upgradesFor(dungeon: SeasonDungeon) {
  const timed = dungeon.timed
  if (!timed) return null
  if (timed.upgrades != null) return timed.upgrades
  if (timed.durationMs == null || dungeon.timeLimitMs == null) return null
  const used = timed.durationMs / dungeon.timeLimitMs
  return used <= .6 ? 3 : used <= .8 ? 2 : 1
}
/** The key level the game would hand you after your best timed run */
export function earnedLevel(dungeon: SeasonDungeon) {
  return dungeon.timed ? dungeon.timed.level + (upgradesFor(dungeon) ?? 1) : null
}
export function timeToSpareMs(dungeon: SeasonDungeon) {
  const timed = dungeon.timed
  return timed?.durationMs != null && dungeon.timeLimitMs != null ? Math.max(0, dungeon.timeLimitMs - timed.durationMs) : null
}

export function dungeonVerdict(dungeon: SeasonDungeon, level: number): KeyVerdict {
  const earned = earnedLevel(dungeon)
  if (!dungeon.timed || earned == null) return 'nodata'
  if (dungeon.timed.level >= level) return 'timed'
  if (level <= earned) return 'reach'
  return level === earned + 1 ? 'stretch' : 'notyet'
}

/** Across dungeons, the verdict that at least half of the dungeons with a timed run reach */
export function overallVerdict(dungeons: SeasonDungeon[], level: number) {
  const verdicts = dungeons.map(dungeon => dungeonVerdict(dungeon, level))
  const counts: Record<KeyVerdict, number> = { timed: 0, reach: 0, stretch: 0, notyet: 0, nodata: 0 }
  for (const verdict of verdicts) counts[verdict]++
  const ranked = verdicts.filter(verdict => verdict !== 'nodata').map(verdict => rank[verdict]).sort((a, b) => a - b)
  if (!ranked.length) return { verdict: 'nodata' as KeyVerdict, counts, withData: 0 }
  return { verdict: byRank[ranked[Math.ceil(ranked.length / 2) - 1]!] as KeyVerdict, counts, withData: ranked.length }
}

export function highestTimed(dungeons: SeasonDungeon[]) {
  return dungeons.reduce<number | null>((best, dungeon) => dungeon.timed && (best == null || dungeon.timed.level > best) ? dungeon.timed.level : best, null)
}
/** The dungeon whose next timed key is lowest, which is usually the cheapest score to gain */
export function lowestDungeon(dungeons: SeasonDungeon[]) {
  return dungeons.filter(dungeon => dungeon.timed).sort((a, b) => a.timed!.level - b.timed!.level || a.dungeon.localeCompare(b.dungeon))[0] ?? null
}
/** A sensible first level to ask about: one past the highest key timed in at least half of the dungeons */
export function suggestedLevel(dungeons: SeasonDungeon[]) {
  for (let level = keyLevels.max; level >= keyLevels.min; level--) if (overallVerdict(dungeons, level).verdict === 'timed') return Math.min(keyLevels.max, level + 1)
  return Math.max(keyLevels.min, (highestTimed(dungeons) ?? keyLevels.min - 1) + 1)
}
