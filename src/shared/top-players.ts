import type { GearSlot } from './domain'

export type TopRegion = 'us' | 'eu' | 'world'
export const topRegionNames: Record<TopRegion, string> = { us: 'North America', eu: 'Europe', world: 'All regions' }
export type TopSlotGroup = Exclude<GearSlot, 'finger1' | 'finger2' | 'trinket1' | 'trinket2'> | 'rings' | 'trinkets'
export const topSlotGroups: Array<{ group: TopSlotGroup; label: string; slots: GearSlot[] }> = [
  { group: 'head', label: 'Head', slots: ['head'] },
  { group: 'neck', label: 'Neck', slots: ['neck'] },
  { group: 'shoulder', label: 'Shoulder', slots: ['shoulder'] },
  { group: 'back', label: 'Cloak', slots: ['back'] },
  { group: 'chest', label: 'Chest', slots: ['chest'] },
  { group: 'wrist', label: 'Wrist', slots: ['wrist'] },
  { group: 'hands', label: 'Hands', slots: ['hands'] },
  { group: 'waist', label: 'Waist', slots: ['waist'] },
  { group: 'legs', label: 'Legs', slots: ['legs'] },
  { group: 'feet', label: 'Feet', slots: ['feet'] },
  { group: 'rings', label: 'Rings', slots: ['finger1', 'finger2'] },
  { group: 'trinkets', label: 'Trinkets', slots: ['trinket1', 'trinket2'] },
  { group: 'mainHand', label: 'Main hand', slots: ['mainHand'] },
  { group: 'offHand', label: 'Off hand', slots: ['offHand'] },
]
/** One exact copy of an item as worn by sampled players, which is the level and bonus IDs a plan should copy */
export type TopCopy = { itemLevel: number; bonusIds: number[]; count: number }
export type TopCount = {
  id: number; name: string; count: number
  /** The item level most sampled players wear it at, the higher one on a tie, for items */
  level?: number | null
  /** Lowest and highest level seen across the sample */
  levelRange?: { min: number; max: number }
  /** The most worn copy, preferring the higher level on a tie; missing in results cached before it was recorded */
  copy?: TopCopy | null
  /** For items, the gems most players socket into this item, one per socket; missing in results cached before it was recorded */
  gems?: number[]
}

/** The copy most players wear, with the higher level winning a tie */
export function commonCopy(copies: Iterable<TopCopy>): TopCopy | null {
  let best: TopCopy | null = null
  for (const copy of copies) if (!best || copy.count > best.count || (copy.count === best.count && copy.itemLevel > best.itemLevel)) best = copy
  return best
}
/** One item exactly as a sampled player wears it, enough to describe it to the engine */
export type TopPlayerItem = { slot: GearSlot; itemId: number; name: string; itemLevel: number; bonusIds: number[]; enchantId: number; gemIds: number[] }
export type TopPlayer = {
  name: string; realm: string; region: string; score: number | null; keyLevel: number | null; dungeon: string | null; url: string; loadout: string | null
  /** Their equipped items, for the players whose gear was sampled; missing in results cached before it was recorded */
  gear?: TopPlayerItem[]
}
export type TopPlayers = {
  season: { slug: string; name: string }
  specId: number; specName: string; className: string; region: TopRegion
  observedAt: string
  runsScanned: number
  source: string
  /** Plain-language description of who was counted, shown with every number */
  population: string
  players: TopPlayer[]
  builds: Array<{ loadout: string; count: number; players: string[] }>
  gearPlayers: number
  averageItemLevel: number | null
  slots: Partial<Record<TopSlotGroup, { items: TopCount[]; enchants: TopCount[]; gems: TopCount[] }>>
}

/**
 * Top players' items with levels capped at the top regular upgrade rank. Ascension levels above it are so rare that
 * copying them into plans or comparisons would be unrealistic; a capped copy drops its bonus IDs, since those name
 * the higher level
 */
export function capTopLevels(top: TopPlayers, cap: number | null): TopPlayers {
  if (cap == null) return top
  const clamp = (entry: TopCount): TopCount => ({
    ...entry,
    ...(entry.level != null ? { level: Math.min(entry.level, cap) } : {}),
    ...(entry.levelRange ? { levelRange: { min: Math.min(entry.levelRange.min, cap), max: Math.min(entry.levelRange.max, cap) } } : {}),
    ...(entry.copy && entry.copy.itemLevel > cap ? { copy: { itemLevel: cap, bonusIds: [], count: entry.copy.count } } : {}),
  })
  const slots: TopPlayers['slots'] = {}
  for (const [group, slot] of Object.entries(top.slots) as Array<[TopSlotGroup, NonNullable<TopPlayers['slots'][TopSlotGroup]>]>) slots[group] = { ...slot, items: slot.items.map(clamp) }
  const players = top.players.map(player => player.gear ? { ...player, gear: player.gear.map(item => ({ ...item, itemLevel: Math.min(item.itemLevel, cap) })) } : player)
  return { ...top, slots, players }
}
