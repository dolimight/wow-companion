import type { VaultTrack } from './weekly'

export type VaultStep = { slot: number; unlocked: boolean; text: string }
const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`
const keys = (n: number) => `${n} more key${n === 1 ? '' : 's'}`

/**
 * What fills or raises each Mythic+ Great Vault choice. A choice's reward is the level of your Nth best key this
 * week, where N is the choice's threshold, so the plan counts keys at or above a target level
 * Reward item levels are not shown: the app has no verified table of vault item levels for this season
 */
export function dungeonVaultPlan(track: VaultTrack, weekLevels: number[], target: number | null): VaultStep[] {
  if (track.kind !== 'dungeon' || track.progress == null) return []
  const levels = [...weekLevels].sort((a, b) => b - a)
  const goal = target ?? levels[0] ?? null
  const atGoal = goal == null ? 0 : levels.filter(level => level >= goal).length
  return track.slots.map((slot, index) => {
    const number = index + 1
    if (slot.unlocked) {
      const reward = levels[slot.threshold - 1]
      if (goal == null || reward == null || reward >= goal) return { slot: number, unlocked: true, text: `${ordinal(number)} choice unlocked${reward != null ? ` at +${reward}` : ''}` }
      return { slot: number, unlocked: true, text: `${ordinal(number)} choice is +${reward}. ${keys(slot.threshold - atGoal)} at +${goal} or higher would raise it to +${goal}` }
    }
    const runs = Math.max(0, slot.threshold - (track.progress ?? 0))
    if (goal == null) return { slot: number, unlocked: false, text: `${keys(runs)} of any level unlock the ${ordinal(number)} choice` }
    const atLevel = Math.max(runs, slot.threshold - atGoal)
    return { slot: number, unlocked: false, text: `${keys(atLevel)} at +${goal} or higher unlock the ${ordinal(number)} choice as a +${goal} reward` }
  })
}
