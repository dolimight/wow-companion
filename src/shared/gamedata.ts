import { z } from 'zod'
import { appearanceSlotSchema, gearSlotSchema, specializationIdSchema, statWeightsSchema, type GearSlot } from './domain'

export type GameDataStatus = {
  state: 'no-install' | 'not-indexed' | 'indexing' | 'ready' | 'error'
  install: { root: string; version: string } | null
  indexedVersion: string | null
  itemCount: number
  progress: { step: string; done: number; total: number } | null
  error: string | null
  /** Usable item data from an older app version, missing stats, effects, and upgrade tracks until prepared again */
  outdated?: boolean
}

export type ItemSource = { encounter: string; instance: string; kind: 'dungeon' | 'raid' | 'other' }
export type ItemPrimaryStat = 'strength' | 'agility' | 'intellect'
export type ItemSummary = { id: number; name: string; quality: number; itemLevel: number; requiredLevel: number; slot: string; inventoryType: number; armor: string | null; icon: number | null; expansion: number; sources: ItemSource[]; classId?: number; subclassId?: number; allowableClassMask?: number | null; specIds?: number[] | null; primaryStats?: ItemPrimaryStat[] | null; setPiece?: boolean; sockets?: number; crafted?: boolean }
export type ItemAppearanceOption = { modifiedAppearanceId: number; appearanceId: number; modifier: number; icon: number | null }
/** An upgrade-track group from the game files: its season scaling set, cross-season track key, and item level per rank */
export type ItemTrackGroup = { group: number; set: number; key: number; levels: number[]; latest: boolean }
export type ItemDetail = ItemSummary & { trackGroups?: number[] | null; trackInfo?: ItemTrackGroup[] | null; classId: number; subclassId: number; bonding: string | null; sockets: number; description: string; appearances: ItemAppearanceOption[] }
/** How an item gets past the crest ladder: a Venomstone at the Catalyst, or an Elevated Myth drop from the raid's last two Mythic bosses */
export type ItemAscension = 'venomstone' | 'elevated'
export const ascensionNames: Record<ItemAscension, string> = { venomstone: 'Venomstone', elevated: 'Elevated' }
/** What decides whether an item can reach a level past the crest ladder */
export type AscensionItem = { inventoryType: number; encounters: string[]; setPiece: boolean; crafted?: boolean; quality?: number; classId?: number }
export const ascensionItem = (item: ItemSummary): AscensionItem => ({ inventoryType: item.inventoryType, encounters: item.sources.map(source => source.encounter), setPiece: !!item.setPiece, crafted: !!item.crafted, quality: item.quality, classId: item.classId })
/** `levels` are the crest upgrade ranks; `beyond` are higher levels with no crest cost that this item can still reach */
export type ItemTrackRange = { name: string; ranks: number; minLevel: number; maxLevel: number; levels: number[]; reagent?: string; beyond?: Array<{ level: number; via: ItemAscension }> }
/**
 * Where a current-season item can land on the upgrade tracks; `assumed` when the game files don't tie this item to a track.
 * `max` is the highest level including any this item reaches past the crest ladder, named by `via`; `ladderLevel` is the top crest rank, which a new plan target starts at
 */
/** `crafted` tracks are reagent bands whose ranks are crafting quality, not crest upgrades */
export type ItemTracks = { season: string; crafted?: boolean; tracks: ItemTrackRange[]; max: { itemLevel: number; track: string; rank: number; ranks: number; assumed: boolean; ladderLevel?: number; via?: ItemAscension } }

/** Crest ranks read as Myth 4/6, crafted ones as Crafted Myth · Q5; levels past the ladder name their route, as in Myth · Venomstone */
export function trackRankLabel(track: string, rank: number, ranks: number, via?: ItemAscension) {
  if (via) return `${track} · ${ascensionNames[via]}`
  // Crafted bands rank by crafting quality rather than crest upgrades
  return track.startsWith('Crafted') ? `${track} · Q${rank}` : `${track} ${rank}/${ranks}`
}

export type TrackLevelOption = { value: string; level: number; label: string; beyond: boolean; via?: ItemAscension; track: string; rank: number; reagent?: string }
/** Every level an item can reach, highest first, with the season's true top marked Max */
export function trackLevelOptions(tracks: ItemTracks): TrackLevelOption[] {
  const max = (track: ItemTrackRange, level: number) => track.name === tracks.max.track && level === tracks.max.itemLevel ? ' · Max' : ''
  return [...tracks.tracks].reverse().flatMap(track => [
    ...(track.beyond ?? []).map(({ level, via }) => ({ value: `${track.name}:${via}`, level, beyond: true, via, track: track.name, rank: 0, label: `${trackRankLabel(track.name, 0, track.ranks, via)} · ${level}${max(track, level)}` })).reverse(),
    ...track.levels.map((level, index) => ({ value: `${track.name}:${index + 1}`, level, beyond: false, track: track.name, rank: index + 1, reagent: track.reagent, label: `${trackRankLabel(track.name, index + 1, track.ranks)} · ${level}${max(track, level)}` })).reverse(),
  ])
}
export type ItemPowerStat = { type: number; name: string; value: number; secondary: boolean }
export type ItemPowerEffect = { label: string; text: string; complete: boolean; cooldown: string | null }
/** Stats and effects worked out from the game's scaling tables for one item level; null parts are unknown */
export type ItemPower = { itemLevel: number; armor: number | null; stats: ItemPowerStat[] | null; effects: ItemPowerEffect[]; setPiece: boolean }
/** How many items each boss that drops this one has in its loot, in total and for the selected character */
export type ItemLootShare = { encounter: string; instance: string; kind: ItemSource['kind']; total: number; forCharacter: number | null }
/** A runeforge has no item: `itemId` is the negative enchant ID, and `enchantId` and `effect` come from its spell */
export type EnhancementOption = { itemId: number; name: string; quality: number; icon: number | null; enchantId?: number; effect?: string }
/** Death Knight runeforges for this expansion, as SpellItemEnchantment IDs; older copies share these names */
/**
 * What a copy's bonus list changes beyond its level: a named variant that adds its own effect (such as Venomcursed), and
 * the upgrade track group it places the copy on
 */
export type BonusInfo = { variant: { name: string; effect: string; icon: number | null } | null; trackGroup: number | null }
/** An item the Catalyst can turn into a tier piece, with the cantrips (variants) its drops can carry over */
export type CatalystSource = { itemId: number; name: string; quality: number; icon: number | null; variants: Array<NonNullable<BonusInfo['variant']> & { bonusId: number }> }
export const runeforgeIds = [3368, 3370, 3847, 6241, 6242, 6243, 6244, 6245]
/** A crafting reagent that embellishes an item; `effect` is filled for the planned item's level, `complete` false when some values are unknown */
export type EmbellishmentOption = EnhancementOption & { applies: string | null; limit: string; effect: string; complete: boolean; bonusLists?: number[] }
export type ItemSearchPage = { items: Array<ItemSummary & { maxLevel?: ItemTracks['max'] | null; effects?: ItemPowerEffect[] }>; nextOffset: number | null }
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
  source: z.enum(['any', 'dungeon', 'raid', 'crafted']).default('any'),
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
  /** Result order: best match, or item level high to low by the highest reachable level or the base level */
  sort: z.enum(['relevance', 'maxLevel', 'baseLevel']).default('relevance'),
  /** Best match ranks items with the same highest level by their secondary stats under these weights, equal when absent */
  weights: statWeightsSchema.nullable().default(null),
  /** Item level range, read against the highest reachable level or the base level */
  levelBasis: z.enum(['max', 'base']).default('max'),
  minLevel: z.number().int().min(1).max(2000).nullable().default(null),
  maxLevel: z.number().int().min(1).max(2000).nullable().default(null),
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
