import { z } from 'zod'
import type { AppearanceSlot } from './domain'

/** The client's Embellished limit categories: how many of each a character can wear, and the bonus lists that put an item in one */
export const embellishmentRulesSchema = z.array(z.object({ name: z.string().min(1), limit: z.number().int().positive(), bonusLists: z.array(z.number().int().positive()).min(1) }))
export type EmbellishmentRules = z.infer<typeof embellishmentRulesSchema>

/** The embellishment category a copy belongs to, from its bonus IDs; undefined when they're unknown */
export function embellishmentOf(rules: EmbellishmentRules | null, bonusIds?: number[] | null) {
  if (!rules || !bonusIds?.length) return undefined
  return rules.find(category => bonusIds.some(id => category.bonusLists.includes(id))) ?? null
}

/** Planned embellishments per category, with any past the limit */
export function embellishmentCounts(rules: EmbellishmentRules | null, items: Array<{ bonusIds?: number[] | null }>) {
  return (rules ?? []).map(category => {
    const count = items.filter(item => embellishmentOf(rules, item.bonusIds)?.name === category.name).length
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
