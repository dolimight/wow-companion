import type { AppearanceSlot, Character } from './domain'

/**
 * Slots where the look the addon saw in game differs from the look Blizzard's profile reports, which is the look its
 * character picture shows. Null when there is nothing to compare or Blizzard's data is newer than the addon's
 */
export function outdatedRenderSlots(character: Pick<Character, 'shownLook' | 'observedTransmog' | 'observedTransmogAt'>): AppearanceSlot[] | null {
  const shown = character.shownLook
  if (!shown || !Object.keys(character.observedTransmog).length) return null
  if (character.observedTransmogAt && Date.parse(character.observedTransmogAt) > Date.parse(shown.observedAt)) return null
  const slots: AppearanceSlot[] = []
  for (const [slot, seen] of Object.entries(shown.slots) as Array<[AppearanceSlot, NonNullable<typeof shown.slots[AppearanceSlot]>]>) {
    const blizzard = character.observedTransmog[slot]
    if (!blizzard) continue
    const differs = blizzard.modifiedAppearanceId !== null ? blizzard.modifiedAppearanceId !== seen.modifiedAppearanceId : seen.itemId !== null && seen.itemId !== blizzard.itemId
    if (differs) slots.push(slot)
  }
  return slots
}
