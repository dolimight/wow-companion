import { z } from 'zod'
import type { AppearanceSlot } from './domain'

/** The client's Embellished limit categories: how many of each a character can wear, and the bonus lists that put an item in one */
export const embellishmentRulesSchema = z.array(z.object({ name: z.string().min(1), limit: z.number().int().positive(), bonusLists: z.array(z.number().int().positive()).min(1) }))
export type EmbellishmentRules = z.infer<typeof embellishmentRulesSchema>

type Embellishable = { bonusIds?: number[] | null; embellishment?: { limit: string } | null }

/**
 * The embellishment category an item belongs to: a planned embellishment first, then the copy's bonus IDs;
 * undefined when neither is known
 */
export function embellishmentOf(rules: EmbellishmentRules | null, bonusIds?: number[] | null, planned?: { limit: string } | null) {
  if (planned && rules) return rules.find(category => category.name === planned.limit) ?? null
  if (!rules || !bonusIds?.length) return undefined
  return rules.find(category => bonusIds.some(id => category.bonusLists.includes(id))) ?? null
}

/** Planned embellishments per category, with any past the limit */
export function embellishmentCounts(rules: EmbellishmentRules | null, items: Embellishable[]) {
  return (rules ?? []).map(category => {
    const count = items.filter(item => embellishmentOf(rules, item.bonusIds, item.embellishment)?.name === category.name).length
    return { name: category.name, limit: category.limit, count, over: Math.max(0, count - category.limit) }
  })
}

const offHandWeapons = new Set([13, 17, 21, 22])

/** Whether this season has an enchant for the item in this slot; an off-hand takes one only when it's a weapon */
export function enchantable(enchantSlots: AppearanceSlot[] | null | undefined, slot: AppearanceSlot, inventoryType?: number | null): boolean | null {
  if (!enchantSlots) return null
  if (!enchantSlots.includes(slot)) return false
  return slot !== 'offHand' || inventoryType == null || offHandWeapons.has(inventoryType)
}
