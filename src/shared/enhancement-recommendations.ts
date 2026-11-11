import type { CharacterStats, StatWeights } from './domain'
import { diminishing, effectiveFromRaw } from './diminishing'

export const statKeys = ['crit', 'haste', 'mastery', 'versatility'] as const
export type SecondaryStat = typeof statKeys[number]
export type Ratings = Record<SecondaryStat, number>
export const equalWeights: StatWeights = { crit: 1, haste: 1, mastery: 1, versatility: 1 }
export const statNames: Record<SecondaryStat, string> = { crit: 'Critical Strike', haste: 'Haste', mastery: 'Mastery', versatility: 'Versatility' }
export const zeroRatings = (): Ratings => ({ crit: 0, haste: 0, mastery: 0, versatility: 0 })

/** Only whole, unconditional flat secondary-stat lines are safe to rank; proc and primary-stat hybrids stay unranked */
export function flatEnhancement(text: string): Ratings | null {
  const result = zeroRatings()
  let count = 0
  const rest = text.replace(/([+]?[\d,]+)\s+(Critical Strike|Haste|Mastery|Versatility)(?:\s+rating)?\b/gi, (_, amount: string, name: string) => {
    const key = statKeys.find(key => statNames[key].toLowerCase() === name.toLowerCase())!
    const value = Number(amount.replaceAll(',', ''))
    result[key] += value; count++
    return ''
  }).replace(/\band\b|[+,&.\s]/gi, '')
  return count && !rest && Object.values(result).every(value => Number.isFinite(value) && value >= 0) ? result : null
}

// Every specialization starts with 8 mastery points before rating
const BASE_MASTERY = 8
/**
 * Sheet percentage per mastery point for the specialization. The game reports mastery from rating already scaled,
 * so the base 8 points account for the rest of the sheet value. Null when the sheet can't show it
 */
export function masteryScale(stats: CharacterStats | null) {
  const shown = stats?.mastery, bonus = stats?.ratingBonus?.mastery
  if (shown == null || bonus == null) return null
  const scale = (shown - bonus) / BASE_MASTERY
  return Number.isFinite(scale) && scale > 0 ? scale : null
}

export type StatConversion = { perPoint: number; raw: number }
export type Conversions = Partial<Record<SecondaryStat, StatConversion>>
/** Mastery uses rating-derived mastery points, never its specialization's displayed effect percentage */
export function ratingConversions(stats: CharacterStats | null): Conversions {
  const result: Conversions = {}
  for (const key of statKeys) {
    const rating = stats?.ratings?.[key], scale = key === 'mastery' ? masteryScale(stats) : 1
    const bonus = stats?.ratingBonus?.[key] == null || !scale ? null : stats.ratingBonus[key]! / scale
    if (rating == null || rating <= 0 || bonus == null || bonus <= 0) continue
    const reading = diminishing(bonus)
    if (reading.capped || reading.raw <= 0) continue
    result[key] = { raw: reading.raw, perPoint: rating / reading.raw }
  }
  return result
}

export type EnhancementScore = { score: number; changes: Array<{ key: SecondaryStat; rating: number; effective: number; retained: number }> }
/** Starting from the entire draft, remove the replaced enhancement before applying its alternative */
export function scoreEnhancement(conversions: Conversions, planDelta: Ratings, previous: Ratings, next: Ratings, weights: StatWeights): EnhancementScore | null {
  let score = 0
  const changes: EnhancementScore['changes'] = []
  for (const key of statKeys) {
    const delta = next[key] - previous[key]
    if (!delta) continue
    const conversion = conversions[key]
    if (!conversion) return null
    const before = conversion.raw + planDelta[key] / conversion.perPoint
    const after = before + delta / conversion.perPoint
    if (before < -1e-6 || after < -1e-6) return null
    const effective = effectiveFromRaw(Math.max(0, after)) - effectiveFromRaw(Math.max(0, before))
    // Scores are weighted effective rating, not a DPS prediction
    score += effective * conversion.perPoint * weights[key]
    changes.push({ key, rating: delta, effective, retained: effective / (delta / conversion.perPoint) })
  }
  return { score, changes }
}

export const statHelp: Record<SecondaryStat, string> = {
  crit: 'Increases the chance of critical damage and healing. It does not directly increase maximum health; defensive benefits depend on your abilities and talents',
  haste: 'Speeds attacks, casts and periodic effects, and affects some cooldowns and resource generation. More actions can improve damage, healing and defensive uptime, but do not directly add health',
  mastery: 'Improves your specialization’s mastery effect. Depending on the specialization, this affects damage, healing, absorbs or mitigation. Displayed mastery percentages are not interchangeable between specializations',
  versatility: 'Increases damage, healing and absorbs, and reduces damage taken at half the output percentage. It improves survivability without directly increasing maximum health',
}
