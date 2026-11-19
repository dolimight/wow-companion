import type { SeasonDungeon } from './domain'

/**
 * Mythic+ score per key level, fitted to the character's own timed runs: a straight line through each dungeon's best
 * run (level, score). Raider.IO publishes run scores but not this season's formula, so the result is an estimate and
 * needs at least two different key levels to draw a line
 */
export type ScoreModel = { base: number; perLevel: number; samples: number }

export function scoreModel(dungeons: Array<Pick<SeasonDungeon, 'timed' | 'score'>>): ScoreModel | null {
  const points = dungeons.flatMap(dungeon => dungeon.timed && dungeon.score ? [{ x: dungeon.timed.level, y: dungeon.score }] : [])
  if (new Set(points.map(point => point.x)).size < 2) return null
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const spread = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  const perLevel = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / spread
  if (!(perLevel > 0)) return null
  return { base: meanY - perLevel * meanX, perLevel, samples: points.length }
}

export const estimatedScore = (model: ScoreModel, level: number) => model.base + model.perLevel * level

export type KeyGain = { dungeon: string; level: number; current: number; gain: number }

/**
 * For each dungeon, the rating timing the next key level would add: the estimated score at one level above its best
 * timed key (or +2 when none is timed) minus the score it counts for now. Best gains first
 */
export function keyGains(dungeons: Array<Pick<SeasonDungeon, 'dungeon' | 'timed' | 'score'>>, model: ScoreModel): KeyGain[] {
  return dungeons.map(dungeon => {
    const level = (dungeon.timed?.level ?? 1) + 1
    const current = dungeon.score ?? 0
    return { dungeon: dungeon.dungeon, level, current, gain: Math.max(0, estimatedScore(model, level) - current) }
  }).sort((a, b) => b.gain - a.gain || a.level - b.level)
}
