import type { CharacterStats } from './domain'
import { diminishing, effectiveFromRaw } from './diminishing'
import { masteryScale, statKeys, zeroRatings, type Ratings, type SecondaryStat } from './enhancement-recommendations'

/** Rating, main stat, and stamina a plan adds or removes compared with the equipped gear */
export type StatDelta = { ratings: Ratings; primary: number; stamina: number }
export const zeroDelta = (): StatDelta => ({ ratings: zeroRatings(), primary: 0, stamina: 0 })

export type ProjectedStats = {
  stats: CharacterStats
  /** Secondary stats whose rating changes but whose percentage can't be worked out from the synced sheet */
  unknown: SecondaryStat[]
}

/**
 * Applies a plan's stat changes to the synced character sheet. Percentages move through diminishing returns from
 * the rating part the game reported, so base values and buffs stay as they were. Health scales with stamina at the
 * character's own ratio
 */
export function projectStats(stats: CharacterStats, delta: StatDelta): ProjectedStats {
  const next: CharacterStats = { ...stats, ratings: stats.ratings ? { ...stats.ratings } : null, ratingBonus: stats.ratingBonus ? { ...stats.ratingBonus } : null }
  const unknown: SecondaryStat[] = []
  if (stats.primary && delta.primary) next.primary = { ...stats.primary, value: Math.max(0, stats.primary.value + delta.primary) }
  if (stats.stamina != null && delta.stamina) {
    next.stamina = Math.max(0, stats.stamina + delta.stamina)
    if (stats.health != null && stats.stamina > 0) next.health = Math.round(stats.health * next.stamina / stats.stamina)
  }
  for (const key of statKeys) {
    const change = delta.ratings[key]
    if (!change) continue
    const rating = stats.ratings?.[key], bonus = stats.ratingBonus?.[key], shown = stats[key]
    if (next.ratings && rating != null) next.ratings[key] = Math.max(0, rating + change)
    // Diminishing returns apply to mastery points, before the specialization's scale turns them into the sheet percentage
    const scale = key === 'mastery' ? masteryScale(stats) : 1
    if (rating == null || rating <= 0 || bonus == null || bonus <= 0 || shown == null || !scale) { unknown.push(key); continue }
    const reading = diminishing(bonus / scale)
    if (reading.capped || reading.raw <= 0) { unknown.push(key); continue }
    const perPoint = rating / reading.raw
    const after = effectiveFromRaw(Math.max(0, reading.raw + change / perPoint)) * scale
    next[key] = shown + after - bonus
    if (next.ratingBonus) next.ratingBonus[key] = after
  }
  return { stats: next, unknown }
}
