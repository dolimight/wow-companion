import { z } from 'zod'

const socketBonusSchema = z.object({ bonusList: z.number().int().positive(), inventoryTypes: z.array(z.number().int().nonnegative()) })
/** Socket bonuses from the client: how many sockets each bonus list adds, which slots drop with one, and which slots can have one added */
export const socketRulesSchema = z.object({ bonusLists: z.record(z.string(), z.number().int().positive()), drop: socketBonusSchema, addable: socketBonusSchema })
export type SocketRules = z.infer<typeof socketRulesSchema>

/** `sockets` the item has, `addable` more a player can still add; `exact` when read from the copy's own bonus IDs */
export type ItemSockets = { sockets: number; addable: number; exact: boolean }

/**
 * Sockets on one copy of an item. A copy with bonus IDs is read exactly; a freshly picked item is assumed
 * to drop the way this season's do, with the jewelry socket and nothing added yet
 */
export function itemSockets(rules: SocketRules | null, item: { inventoryType: number; sockets: number }, bonusIds?: number[] | null): ItemSockets {
  if (!rules) return { sockets: item.sockets, addable: 0, exact: false }
  const canAdd = rules.addable.inventoryTypes.includes(item.inventoryType)
  if (bonusIds?.length) {
    const added = bonusIds.reduce((sum, id) => sum + (rules.bonusLists[String(id)] ?? 0), 0)
    return { sockets: item.sockets + added, addable: canAdd && !bonusIds.includes(rules.addable.bonusList) ? 1 : 0, exact: true }
  }
  return { sockets: item.sockets + (rules.drop.inventoryTypes.includes(item.inventoryType) ? rules.bonusLists[String(rules.drop.bonusList)] ?? 0 : 0), addable: canAdd ? 1 : 0, exact: false }
}

/** Reads as 2 sockets, or 1 socket · 1 more can be added */
export function socketLabel({ sockets, addable }: ItemSockets) {
  const base = sockets ? `${sockets} socket${sockets === 1 ? '' : 's'}` : 'No sockets'
  return addable ? `${base} · ${addable}${sockets ? ' more' : ''} can be added` : base
}
