import type { AppearanceRef, AppearanceSlot, Outfit } from './domain'
import type { OutfitModelPiece } from './model'

/** A split shoulder can override either side of a shared appearance; hidden sides always win */
export function outfitModelPieces(outfit: Pick<Outfit, 'slots' | 'hiddenSlots'>): OutfitModelPiece[] {
  const hidden = new Set(outfit.hiddenSlots)
  const pieces: OutfitModelPiece[] = []
  const add = (slot: AppearanceSlot, appearance: AppearanceRef | undefined) => {
    if (!appearance || hidden.has(slot)) return
    const { itemId, modifiedAppearanceId, appearanceId } = appearance
    pieces.push({ slot, itemId, modifiedAppearanceId, appearanceId })
  }
  const shared = hidden.has('shoulder') ? undefined : outfit.slots.shoulder
  add('shoulderLeft', outfit.slots.shoulderLeft ?? shared)
  add('shoulderRight', outfit.slots.shoulderRight ?? shared)
  for (const [slot, entry] of Object.entries(outfit.slots) as Array<[AppearanceSlot, AppearanceRef]>) {
    if (slot !== 'shoulder' && slot !== 'shoulderLeft' && slot !== 'shoulderRight') add(slot, entry)
  }
  return pieces.sort((a, b) => a.slot.localeCompare(b.slot))
}
