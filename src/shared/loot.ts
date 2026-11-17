import type { LootItem } from './dungeons'
import { getItemCompatibility } from './item-compatibility'
import type { ItemSearchCharacter } from './gamedata'

/** A tier token: a class-locked item traded for a set piece, so it counts as gear */
const isToken = (item: LootItem) => item.inventoryType === 0 && item.classId === 15 && item.subclassId === 0 && item.allowableClassMask != null && item.allowableClassMask !== -1

/** Gear and tier tokens; mounts, pets, decor, recipes, and reagents drop too but are never a Voidcore's reward */
export const isGearDrop = (item: LootItem) => item.inventoryType > 0 || isToken(item)

/** What a drop is, where its slot says only Other */
export function lootKind(item: LootItem): string {
  if (isToken(item)) return 'Tier token'
  if (item.inventoryType > 0) return [item.armor ? item.armor[0]!.toUpperCase() + item.armor.slice(1) : null, item.slot].filter(Boolean).join(' · ')
  if (item.classId === 15 && item.subclassId === 5) return 'Mount'
  if (item.classId === 15 && item.subclassId === 2) return 'Pet'
  if (item.classId === 20) return 'Decor'
  if (item.classId === 9) return 'Recipe'
  return item.slot
}

/**
 * Whether a drop is on this character's loot table: gear that fits the class and spec, where a trinket must also be on
 * the spec's list even though any class can wear one. A Nebulous Voidcore rolls only from these, for the loot spec
 */
export function inLootTable(item: LootItem, character: ItemSearchCharacter) {
  if (!isGearDrop(item)) return false
  if (!getItemCompatibility({ ...item, itemLevel: 0, expansion: 0, sources: [] }, character).compatible) return false
  return item.inventoryType !== 12 || !item.specIds?.length || character.specId == null || item.specIds.includes(character.specId)
}

/** A Voidcore roll's chance of each item in a pool of this size, as a percentage to one decimal */
export const voidcoreShare = (pool: number) => pool > 0 ? Math.round(1000 / pool) / 10 : 0

/**
 * One entry per piece: a dungeon brought back from an older expansion lists both the old and the reissued item, with the
 * same name and slot, and the newer one is what drops
 */
export function uniqueDrops(items: LootItem[]): LootItem[] {
  const byPiece = new Map<string, LootItem>()
  for (const item of items) { const key = `${item.name}|${item.inventoryType}`; const seen = byPiece.get(key); if (!seen || item.id > seen.id) byPiece.set(key, item) }
  return items.filter(item => byPiece.get(`${item.name}|${item.inventoryType}`) === item)
}
