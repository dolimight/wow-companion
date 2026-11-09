import { z } from 'zod'
import { appearanceSlotSchema, gearSlotSchema, specializationIdSchema, type GearSlot } from './domain'

export type GameDataStatus = {
  state: 'no-install' | 'not-indexed' | 'indexing' | 'ready' | 'error'
  install: { root: string; version: string } | null
  indexedVersion: string | null
  itemCount: number
  progress: { step: string; done: number; total: number } | null
  error: string | null
}

export type ItemSource = { encounter: string; instance: string; kind: 'dungeon' | 'raid' | 'other' }
export type ItemPrimaryStat = 'strength' | 'agility' | 'intellect'
export type ItemSummary = { id: number; name: string; quality: number; itemLevel: number; requiredLevel: number; slot: string; inventoryType: number; armor: string | null; icon: number | null; expansion: number; sources: ItemSource[]; classId?: number; subclassId?: number; allowableClassMask?: number | null; specIds?: number[] | null; primaryStats?: ItemPrimaryStat[] | null }
export type ItemAppearanceOption = { modifiedAppearanceId: number; appearanceId: number; modifier: number; icon: number | null }
/** An upgrade-track group from the game files: its season scaling set, cross-season track key, and item level per rank */
export type ItemTrackGroup = { group: number; set: number; key: number; levels: number[]; latest: boolean }
export type ItemDetail = ItemSummary & { trackGroups?: number[] | null; trackInfo?: ItemTrackGroup[] | null; classId: number; subclassId: number; bonding: string | null; sockets: number; description: string; appearances: ItemAppearanceOption[] }
export type ItemTrackRange = { name: string; ranks: number; minLevel: number; maxLevel: number; levels: number[] }
/** Where a current-season item can land on the upgrade tracks; `assumed` when the game files don't tie this item to a track */
export type ItemTracks = { season: string; tracks: ItemTrackRange[]; max: { itemLevel: number; track: string; rank: number; ranks: number; assumed: boolean } }
export type ItemPowerStat = { type: number; name: string; value: number; secondary: boolean }
export type ItemPowerEffect = { label: string; text: string; complete: boolean; cooldown: string | null }
/** Stats and effects worked out from the game's scaling tables for one item level; null parts are unknown */
export type ItemPower = { itemLevel: number; armor: number | null; stats: ItemPowerStat[] | null; effects: ItemPowerEffect[]; setPiece: boolean }
/** How many items each boss that drops this one has in its loot, in total and for the selected character */
export type ItemLootShare = { encounter: string; instance: string; kind: ItemSource['kind']; total: number; forCharacter: number | null }
export type EnhancementOption = { itemId: number; name: string; quality: number; icon: number | null }
export type ItemSearchPage = { items: Array<ItemSummary & { maxLevel?: ItemTracks['max'] | null }>; nextOffset: number | null }
export type AppearanceOption = { appearanceId: number; modifiedAppearanceId: number; itemId: number; itemName: string; quality: number; icon: number | null }

export const armorTypes = ['cloth', 'leather', 'mail', 'plate'] as const
export type ArmorType = (typeof armorTypes)[number]

export const itemSearchCharacterSchema = z.object({
  className: z.string().max(100),
  specId: specializationIdSchema,
  level: z.number().int().nonnegative().nullable(),
})
export type ItemSearchCharacter = z.infer<typeof itemSearchCharacterSchema>

export const itemSearchSchema = z.object({
  text: z.string().max(100).default(''),
  slot: appearanceSlotSchema.nullable().default(null),
  armor: z.enum(armorTypes).nullable().default(null),
  character: itemSearchCharacterSchema.nullable().default(null),
  source: z.enum(['any', 'dungeon', 'raid']).default('any'),
  currentOnly: z.boolean().default(false),
  /** Only items carrying this secondary stat */
  stat: z.enum(['any', 'crit', 'haste', 'mastery', 'versatility']).default('any'),
  /** Only items of this quality, by its index in qualityNames */
  quality: z.number().int().min(0).max(7).nullable().default(null),
  /** Only items dropping in this dungeon or raid */
  instance: z.string().max(120).nullable().default(null),
  /** Only items with an on-use, equip, or proc effect */
  withEffect: z.boolean().default(false),
  /** Only items with at least one gem socket */
  withSocket: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(40),
  offset: z.number().int().nonnegative().default(0),
})
export type ItemSearch = z.input<typeof itemSearchSchema>
/** Secondary stat filter values and the game's stat type for each */
export const secondaryStatTypes = { crit: 32, haste: 36, mastery: 49, versatility: 40 } as const
export type ItemInstance = { name: string; kind: string }

/** Inventory types the game uses for each paper-doll slot */
export const slotInventoryTypes: Record<z.infer<typeof appearanceSlotSchema>, number[]> = {
  head: [1], neck: [2], shoulder: [3], shoulderLeft: [3], shoulderRight: [3], back: [16], chest: [5, 20], shirt: [4], tabard: [19], wrist: [9], hands: [10], waist: [6], legs: [7], feet: [8],
  finger1: [11], finger2: [11], trinket1: [12], trinket2: [12], mainHand: [13, 17, 21, 15, 26], offHand: [13, 14, 22, 23],
}

export const inventoryTypeNames: Record<number, string> = {
  1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Shirt', 5: 'Chest', 6: 'Waist', 7: 'Legs', 8: 'Feet', 9: 'Wrist', 10: 'Hands', 11: 'Finger', 12: 'Trinket', 13: 'One-hand', 14: 'Shield', 15: 'Ranged', 16: 'Back', 17: 'Two-hand', 19: 'Tabard', 20: 'Chest', 21: 'Main hand', 22: 'Off hand', 23: 'Held in off hand', 26: 'Ranged',
}

export const qualityNames = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'] as const

/** Armor proficiency by class, used to keep search results wearable */
export function armorForClass(className: string): ArmorType | null {
  const name = className.toLowerCase()
  if (['warrior', 'paladin', 'death knight'].includes(name)) return 'plate'
  if (['hunter', 'shaman', 'evoker'].includes(name)) return 'mail'
  if (['rogue', 'druid', 'monk', 'demon hunter'].includes(name)) return 'leather'
  if (['mage', 'priest', 'warlock'].includes(name)) return 'cloth'
  return null
}

/** Slots whose items come in cloth, leather, mail, and plate */
export const armorSlots = new Set(['head', 'shoulder', 'shoulderLeft', 'shoulderRight', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'])

/** Gear planner slots that can hold an item of this inventory type */
export function gearSlotsForInventoryType(inventoryType: number): GearSlot[] {
  return gearSlotSchema.options.filter((slot) => slotInventoryTypes[slot].includes(inventoryType))
}
