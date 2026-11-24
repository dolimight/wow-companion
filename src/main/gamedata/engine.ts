import Database from 'better-sqlite3'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { decodeBlp, encodePng } from './blp'
import { LocalCasc } from './casc'
import { Definitions } from './definitions'
import { detectInstall, readInstall, type WowInstall } from './install'
import { readHeader, readTable, type Row } from './wdc'
import { readM2, readM2File, readSkin } from './m2'
import { colorName, paletteOf, tagString, themeTags, type LookColor } from '../../shared/looks'
import { bareGeosets, outfitGeosets, wearableTypes, weaponAnimations, wornAttachments, type CharacterModelLook, type CreatureModel, type DressedModel, type ItemModel, type ModelPart, type OutfitModel, type OutfitModelPiece, type WornModel } from '../../shared/model'
import { syncedCharacterLook } from './character-look'
import { armorSlots, armorTypes, inventoryTypeNames, itemSearchSchema, secondaryStatTypes, slotInventoryTypes, type AppearanceOption, type BonusInfo, type CatalystSource, type EmbellishmentOption, type EnhancementOption, runeforgeIds, type GameDataStatus, type ItemDetail, type ItemInstance, type ItemLootShare, type ItemPower, type ItemSearch, type ItemSearchCharacter, type ItemSource, type ItemSummary } from '../../shared/gamedata'
import { effectText, scaledArmor, scaledEffects, scaledStats, type ArmorLocationRow, type ItemEffectData, type ItemStatBlock, type RatingColumns, type ScalingLevel, type SpellData } from '../../shared/item-scaling'
import type { AppearanceSlot, StatWeights } from '../../shared/domain'
import { equalWeights } from '../../shared/enhancement-recommendations'
import { getItemCompatibility } from '../../shared/item-compatibility'
import { compatibilityMetadata } from './item-metadata'
import { elevatedEncounters, embellishmentRules, itemTracks } from '../item-tracks'
import { buildTalentTree, specializationRows, talentSpells } from './talents'
import type { TalentTree } from '../../shared/talents'
import { dungeonKey, journalFlags, journalSpellText, journalText, placeholderTitle, journalDifficultyIds, type DungeonJournal, type EnemySpell, type JournalDifficulty, type JournalSpell, type JournalAbility, type JournalBoss, type JournalFlag, type JournalRole, type LootItem } from '../../shared/dungeons'

/** Windows refuses to replace a file another handle has open, and antivirus scans hold new files briefly, so retry before giving up */
export async function replaceFile(from: string, to: string, attempts = 20, delayMs = 250) {
  for (let attempt = 1; ; attempt++) {
    try { return await rename(from, to) } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error
      if (attempt >= attempts) throw new Error('Item data is open in another program, such as a second copy of WOW Companion · Close it and try again')
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export const INDEX_VERSION = 7
/** Game tables that are plain text rather than client databases, by file ID in the community listfile */
const GAME_TABLES = { combatRatings: 1391670, stamina: 1980632, socketCost: 1391643 }

/** Reads a tab-separated game table keyed by its first column */
export function parseGameTable(text: string): Map<number, number[]> {
  const rows = text.trim().split(/\r?\n/).slice(1).map(line => line.split('\t').map(Number))
  return new Map(rows.filter(row => Number.isFinite(row[0])).map(row => [row[0]!, row.slice(1)]))
}
const IDLE_CLOSE_MS = 90_000

/** Strips client markup such as atlas icons, colour codes, and value tokens from display text */
export function cleanGameText(text: string, values: number[] = []) {
  return text
    .replace(/\|A:Professions-ChatIcon-Quality-Tier(\d):[^|]*\|a/g, ' (rank $1)')
    .replace(/\|A:[^|]*\|a/g, '')
    .replace(/\|T[^|]*\|t/g, '')
    .replace(/\|c[0-9a-fA-F]{8}/g, '')
    .replace(/\|r/g, '')
    .replace(/(\+?)\$k(\d)\s*/g, (_match, plus: string, index: string) => { const value = values[Number(index) - 1]; return value ? `${plus}${value} ` : '' })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stat types, budget shares, and socket shares as stored for scaling; null when the item carries no stats */
function statBlock(row: Row) {
  const types = row.StatModifier_bonusStat as number[] | undefined, alloc = row.StatPercentEditor as number[] | undefined
  if (!Array.isArray(types) || !Array.isArray(alloc) || !alloc.some(Boolean)) return null
  return JSON.stringify({ t: types, a: alloc, s: (row.StatPercentageOfSocket as number[] | undefined) ?? [] })
}

const bondingNames: Record<number, string> = { 1: 'Binds when picked up', 2: 'Binds when equipped', 3: 'Binds when used', 4: 'Quest item', 7: 'Binds to Warband', 8: 'Binds to Warband until equipped', 9: 'Binds to Warband until equipped' }
/** Item enhancement subclasses by paper-doll slot, used to list enchants */
const enchantSubclasses: Partial<Record<AppearanceSlot, number[]>> = { head: [0], neck: [1], shoulder: [2], back: [3], chest: [4], wrist: [5], hands: [6], waist: [7], legs: [8], feet: [9], finger1: [10], finger2: [10], mainHand: [11, 12], offHand: [11, 13] }
const JUNK = `i.name != '' AND i.name NOT LIKE 'Monster -%' AND i.name NOT LIKE '%[PH]%' AND i.name NOT LIKE 'OLD%' AND i.name NOT LIKE 'Test %' AND i.name NOT LIKE '%Deprecated%' AND i.name NOT LIKE 'zz%' AND i.name NOT LIKE '%(old)%'`
const outfitLayerOrder: AppearanceSlot[] = ['shirt', 'legs', 'chest', 'feet', 'wrist', 'hands', 'tabard', 'waist', 'back', 'head', 'shoulder', 'shoulderLeft', 'shoulderRight', 'mainHand', 'offHand']
const EQUIPPABLE = Object.keys(inventoryTypeNames).join(',')
/** Look filters for mounts and pets */
type LookFilter = { effect?: 'any' | 'with' | 'without'; tags?: string[] }

type ItemRow = { id: number; name: string; quality: number; item_level: number; required_level: number; inventory_type: number; class_id: number; subclass_id: number; icon: number | null; expansion: number; bonding: number; sockets: number; description: string; allowable_class_mask?: number | null; spec_ids?: string | null; primary_stats?: string | null; stats?: string | null; item_set?: number | null; track_groups?: string | null; latest_track?: number | null; crafted?: number | null }

/** An item's secondary stat budget, each stat counted by how much the character values it */
function statFit(row: Pick<ItemRow, 'stats'>, weights: StatWeights | null) {
  if (!row.stats) return 0
  const { t, a } = JSON.parse(row.stats) as { t: number[]; a: number[] }
  const active = weights ?? equalWeights
  return t.reduce((sum, type, index) => {
    const stat = secondaryStatKeys.get(type)
    return stat ? sum + Math.max(0, a[index] ?? 0) * active[stat] : sum
  }, 0)
}
const secondaryStatKeys = new Map(Object.entries(secondaryStatTypes).map(([key, type]) => [type as number, key as keyof StatWeights]))

export type EngineEvents = { status(status: GameDataStatus): void }

export class GameDataEngine {
  private install: WowInstall | null = null
  private casc: Promise<LocalCasc> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private db: Database.Database | null = null
  private indexVersion: number | null = null
  /** Every upgrade track group, read once per index for sorting and filtering by highest reachable level */
  private groupCache: Map<number, { group: number; set: number; key: number; levels: number[]; latest: boolean }> | null = null
  private elevatedCache: Map<number, string[]> | null = null
  /** Items the Catalyst makes, from the game's ItemConversionEntry table; read in the background once the index opens */
  private conversionItems: Set<number> | null = null
  private conversionLoad: Promise<Set<number>> | null = null
  private indexing: Promise<void> | null = null
  private status: GameDataStatus = { state: 'no-install', install: null, indexedVersion: null, itemCount: 0, progress: null, error: null }
  private definitions: Definitions

  constructor(private readonly directory: string, private readonly events: EngineEvents) {
    this.definitions = new Definitions(path.join(directory, 'definitions'))
  }

  getStatus() { return this.status }
  private publish(patch: Partial<GameDataStatus>) { this.status = { ...this.status, ...patch }; this.events.status(this.status) }

  /** Uses a saved install path when it still exists, otherwise detects one */
  async configure(preferredPath: string | null) {
    const install = (preferredPath ? await readInstall(preferredPath) : null) ?? await detectInstall()
    await this.useInstall(install)
    return install
  }

  async useInstall(install: WowInstall | null) {
    await this.releaseCasc()
    this.db?.close(); this.db = null; this.indexVersion = null; this.groupCache = null; this.elevatedCache = null; this.conversionItems = null; this.conversionLoad = null
    this.install = install
    if (!install) { this.publish({ state: 'no-install', install: null, indexedVersion: null, itemCount: 0, progress: null, error: null, outdated: false }); return }
    const file = this.indexPath(install.build.version)
    let opened: Database.Database | undefined
    try {
      const db = opened = new Database(file, { readonly: true, fileMustExist: true })
      const version = (db.prepare("SELECT value FROM meta WHERE key = 'index_version'").get() as { value: string } | undefined)?.value
      if (![1, 2, 3, 4, 5, INDEX_VERSION].includes(Number(version))) throw new Error('Index format changed')
      this.db = db
      this.indexVersion = Number(version)
      const count = (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n
      if (this.indexVersion === INDEX_VERSION) void this.catalystItems().catch(() => {})
      this.publish({ outdated: this.indexVersion !== INDEX_VERSION, state: this.indexVersion === INDEX_VERSION ? 'ready' : 'not-indexed', install: { root: install.root, version: install.build.version }, indexedVersion: install.build.version, itemCount: count, progress: null, error: null })
    } catch {
      opened?.close(); this.db = null; this.indexVersion = null
      this.publish({ state: 'not-indexed', install: { root: install.root, version: install.build.version }, indexedVersion: null, itemCount: 0, progress: null, error: null, outdated: false })
    }
  }

  private indexPath(version: string) { return path.join(this.directory, `items-${version}.sqlite`) }

  private openCasc() {
    if (!this.install) throw new Error('World of Warcraft was not found on this computer')
    this.casc ??= LocalCasc.open(this.install).catch(error => { this.casc = null; throw error })
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => void this.releaseCasc(), IDLE_CLOSE_MS)
    this.idleTimer.unref?.()
    return this.casc
  }

  private async releaseCasc() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.traitTables.clear()
    const casc = this.casc
    this.casc = null
    if (casc) await (await casc.catch(() => null))?.close()
  }

  private async table(casc: LocalCasc, name: string, pick?: string[]): Promise<Map<number, Row>> {
    const buffer = await casc.file(await this.definitions.fileDataId(name))
    const fields = await this.definitions.fields(name, casc.version, readHeader(buffer).layoutHash)
    return readTable(buffer, fields, pick ? new Set(pick) : undefined)
  }

  ensureIndex(force = false): Promise<void> {
    if (this.indexing) return this.indexing
    if (!force && this.status.state === 'ready' && this.indexVersion === INDEX_VERSION) return Promise.resolve()
    this.indexing = this.buildIndex().finally(() => { this.indexing = null })
    return this.indexing
  }

  private async buildIndex() {
    const install = this.install
    if (!install) throw new Error('World of Warcraft was not found on this computer')
    const steps = ['Opening game data', 'Reading items', 'Reading item details', 'Reading appearances', 'Reading enchants', 'Reading dungeon and raid loot', 'Reading stats and effects', 'Building search']
    const progress = (done: number) => this.publish({ state: 'indexing', progress: { step: steps[done]!, done, total: steps.length }, error: null })
    const target = this.indexPath(install.build.version)
    const temporary = `${target}.${process.pid}.tmp`
    let buildingDb: Database.Database | undefined
    try {
      progress(0)
      await mkdir(this.directory, { recursive: true })
      const casc = await this.openCasc()
      progress(1)
      const items = await this.table(casc, 'Item', ['ClassID', 'SubclassID', 'InventoryType', 'IconFileDataID'])
      progress(2)
      const sparse = await this.table(casc, 'ItemSparse', ['Display_lang', 'Description_lang', 'OverallQualityID', 'ItemLevel', 'RequiredLevel', 'ExpansionID', 'Bonding', 'SocketType', 'AllowableClass', 'StatModifier_bonusStat', 'StatPercentEditor', 'StatPercentageOfSocket', 'ItemSet', 'ModifiedCraftingReagentItemID'])
      // A missing or unsupported table leaves restrictions unknown instead of claiming no restrictions
      const specOverrides = await this.table(casc, 'ItemSpecOverride', ['ItemID', 'SpecID']).catch(() => null)
      const completeSpecOverrides = specOverrides && specOverrides.size>0 && [...specOverrides.values()].every(row=>typeof row.ItemID==='number'&&Number.isInteger(row.ItemID)&&row.ItemID>=0&&typeof row.SpecID==='number'&&Number.isInteger(row.SpecID)&&row.SpecID>=0&&((row.ItemID===0&&row.SpecID===0)||(row.ItemID>0&&row.SpecID>0)))
      const specsByItem = completeSpecOverrides ? new Map<number, number[]>() : null
      if (specsByItem && specOverrides) for (const row of specOverrides.values()) {
        const itemId = row.ItemID as number, specId = row.SpecID as number
        if (itemId===0 && specId===0) continue // Deleted/tombstone rows present in the installed Retail table
        const list = specsByItem.get(itemId) ?? []
        if (!list.includes(specId)) list.push(specId)
        specsByItem.set(itemId, list)
      }
      progress(3)
      const modified = await this.table(casc, 'ItemModifiedAppearance')
      const appearances = await this.table(casc, 'ItemAppearance', ['DefaultIconFileDataID', 'ItemDisplayInfoID'])
      progress(4)
      const enchants = await this.table(casc, 'SpellItemEnchantment', ['Name_lang', 'EffectPointsMin', 'IconFileDataID'])
      progress(5)
      const encounterItems = await this.table(casc, 'JournalEncounterItem')
      const encounters = await this.table(casc, 'JournalEncounter', ['Name_lang', 'JournalInstanceID'])
      const instances = await this.table(casc, 'JournalInstance', ['Name_lang', 'MapID'])
      const maps = await this.table(casc, 'Map', ['InstanceType'])
      progress(6)
      // Stats and effects are extras: a table this build can't read leaves them unknown instead of failing item search
      const scaling = await this.scalingTables(casc).catch(() => null)
      const embellished = await this.embellishmentTables(casc, items, sparse).catch(() => null)
      const effects = await this.effectTables(casc, items, embellished?.flatMap(entry => [...entry.description.matchAll(/\$@spelldesc(\d+)/g)].map(match => Number(match[1]))) ?? []).catch(() => null)
      const trackGroups = await this.trackGroups(casc).catch(() => null)
      const crafted = await this.table(casc, 'CraftingData', ['CraftedItemID']).then(rows => new Set([...rows.values()].map(row => Number(row.CraftedItemID)).filter(Boolean))).catch(() => null)
      progress(7)
      await rm(temporary, { force: true })
      const db = buildingDb = new Database(temporary)
      db.pragma('journal_mode = OFF')
      db.pragma('synchronous = OFF')
      db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, quality INTEGER NOT NULL, item_level INTEGER NOT NULL, required_level INTEGER NOT NULL, inventory_type INTEGER NOT NULL, class_id INTEGER NOT NULL, subclass_id INTEGER NOT NULL, icon INTEGER, expansion INTEGER NOT NULL, bonding INTEGER NOT NULL, sockets INTEGER NOT NULL, description TEXT NOT NULL, allowable_class_mask INTEGER, spec_ids TEXT, primary_stats TEXT, stats TEXT, item_set INTEGER, track_groups TEXT, latest_track INTEGER, crafted INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE track_groups (group_id INTEGER PRIMARY KEY, scaling_set INTEGER NOT NULL, track_key INTEGER NOT NULL, levels TEXT NOT NULL);
        CREATE TABLE scaling (item_level INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE armor_locations (inventory_type INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE item_effects (item_id INTEGER NOT NULL, spell_id INTEGER NOT NULL, trigger_type INTEGER NOT NULL, cooldown_ms INTEGER NOT NULL, charges INTEGER NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE spells (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE appearances (modified_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, appearance_id INTEGER NOT NULL, modifier INTEGER NOT NULL, icon INTEGER);
        CREATE TABLE sources (item_id INTEGER NOT NULL, encounter TEXT NOT NULL, instance TEXT NOT NULL, kind TEXT NOT NULL, season INTEGER NOT NULL);
        CREATE TABLE enchants (id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon INTEGER);
        CREATE TABLE embellishments (item_id INTEGER PRIMARY KEY, name TEXT NOT NULL, quality INTEGER NOT NULL, icon INTEGER, description TEXT NOT NULL, applies TEXT, limit_name TEXT NOT NULL, bonus_lists TEXT NOT NULL DEFAULT '[]');`)
      const insertItem = db.prepare('INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      const insertAppearance = db.prepare('INSERT OR IGNORE INTO appearances VALUES (?,?,?,?,?)')
      const insertSource = db.prepare('INSERT INTO sources VALUES (?,?,?,?,?)')
      const insertEnchant = db.prepare('INSERT INTO enchants VALUES (?,?,?)')
      const appearanceIcons = new Map<number, number>()
      db.transaction(() => {
        for (const [id, row] of modified) {
          const appearance = appearances.get(row.ItemAppearanceID as number)
          const icon = (appearance?.DefaultIconFileDataID as number) || null
          insertAppearance.run(id, row.ItemID, row.ItemAppearanceID, row.ItemAppearanceModifierID, icon)
          if (icon && !appearanceIcons.has(row.ItemID as number)) appearanceIcons.set(row.ItemID as number, icon)
        }
        for (const [id, row] of sparse) {
          const base = items.get(id)
          const sockets = (row.SocketType as number[] | undefined)?.filter(Boolean).length ?? 0
          const icon = (base?.IconFileDataID as number) || appearanceIcons.get(id) || null
          const compatibility = compatibilityMetadata(row, specsByItem?.get(id) ?? (specsByItem ? [] : null))
          insertItem.run(id, cleanGameText(String(row.Display_lang ?? '')), row.OverallQualityID ?? 1, row.ItemLevel ?? 0, Math.max(0, Number(row.RequiredLevel ?? 0)), base?.InventoryType ?? 0, base?.ClassID ?? 0, base?.SubclassID ?? 0, icon, row.ExpansionID ?? 0, row.Bonding ?? 0, sockets, cleanGameText(String(row.Description_lang ?? '')), compatibility.allowableClassMask, compatibility.specIds===null?null:JSON.stringify(compatibility.specIds), compatibility.primaryStats===null?null:JSON.stringify(compatibility.primaryStats), statBlock(row), Number(row.ItemSet ?? 0) || null, trackGroups?.items.get(id) ? JSON.stringify(trackGroups.items.get(id)) : null, trackGroups?.items.get(id)?.some(group => trackGroups.groups.get(group)?.set === trackGroups.latestSet) ? 1 : 0, crafted?.has(id) ? 1 : 0)
        }
        if (scaling) {
          const insertScaling = db.prepare('INSERT INTO scaling VALUES (?,?)'), insertLocation = db.prepare('INSERT INTO armor_locations VALUES (?,?)')
          for (const level of scaling.levels) insertScaling.run(level.itemLevel, JSON.stringify(level))
          for (const [type, location] of scaling.locations) insertLocation.run(type, JSON.stringify(location))
        }
        if (trackGroups) {
          const insertGroup = db.prepare('INSERT INTO track_groups VALUES (?,?,?,?)')
          for (const [group, info] of trackGroups.groups) insertGroup.run(group, info.set, info.key, JSON.stringify(info.levels))
        }
        if (effects) {
          const insertEffect = db.prepare('INSERT INTO item_effects VALUES (?,?,?,?,?,?)'), insertSpell = db.prepare('INSERT INTO spells VALUES (?,?)')
          for (const link of effects.links) insertEffect.run(link.itemId, link.spellId, link.trigger, link.cooldownMs, link.charges, link.position)
          for (const spell of effects.spells.values()) insertSpell.run(spell.id, JSON.stringify(spell))
        }
        if (embellished) {
          const insertEmbellishment = db.prepare('INSERT INTO embellishments VALUES (?,?,?,?,?,?,?,?)')
          for (const entry of embellished) insertEmbellishment.run(entry.itemId, entry.name, entry.quality, entry.icon, entry.description, entry.applies, entry.limit, JSON.stringify(entry.bonusLists))
        }
        for (const [id, row] of enchants) {
          const name = cleanGameText(String(row.Name_lang ?? ''), row.EffectPointsMin as number[] | undefined)
          if (name) insertEnchant.run(id, name, (row.IconFileDataID as number) || null)
        }
        for (const row of encounterItems.values()) {
          const encounter = encounters.get(row.JournalEncounterID as number)
          const instance = encounter ? instances.get(encounter.JournalInstanceID as number) : undefined
          if (!encounter || !instance) continue
          const type = maps.get(instance.MapID as number)?.InstanceType
          const kind = type === 1 ? 'dungeon' : type === 2 ? 'raid' : 'other'
          insertSource.run(row.ItemID, cleanGameText(String(encounter.Name_lang)), cleanGameText(String(instance.Name_lang)), kind, row.DisplaySeasonID ?? 0)
        }
      })()
      db.exec(`CREATE INDEX items_slot ON items (inventory_type, class_id, subclass_id);
        CREATE INDEX appearances_item ON appearances (item_id);
        CREATE INDEX appearances_appearance ON appearances (appearance_id);
        CREATE INDEX sources_item ON sources (item_id);
        CREATE INDEX sources_encounter ON sources (encounter, instance);
        CREATE INDEX item_effects_item ON item_effects (item_id);
        CREATE VIRTUAL TABLE items_fts USING fts5 (name, content='items', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
        INSERT INTO items_fts (rowid, name) SELECT id, name FROM items;`)
      const meta = db.prepare('INSERT INTO meta VALUES (?,?)')
      meta.run('index_version', String(INDEX_VERSION))
      meta.run('game_version', install.build.version)
      meta.run('built_at', new Date().toISOString())
      db.close()
      buildingDb = undefined
      this.db?.close(); this.db = null
      await replaceFile(temporary, target)
      await this.removeOldIndexes(target)
      await this.useInstall(install)
    } catch (error) {
      buildingDb?.close()
      await rm(temporary, { force: true }).catch(() => {})
      // Reopen the previous complete file if replacement failed after its handle was closed
      if (!this.db) await this.useInstall(install).catch(() => {})
      this.publish({ state: this.db ? 'ready' : 'error', outdated: !!this.db && this.indexVersion !== INDEX_VERSION, progress: null, error: error instanceof Error ? error.message : 'Item data could not be prepared' })
      throw error
    }
  }

  /** Stat budgets, rating and stamina multipliers, and armour values for every item level */
  private async scalingTables(casc: LocalCasc) {
    const points = await this.table(casc, 'RandPropPoints')
    const quality = await this.table(casc, 'ItemArmorQuality').catch(() => null)
    const total = await this.table(casc, 'ItemArmorTotal').catch(() => null)
    const shield = await this.table(casc, 'ItemArmorShield').catch(() => null)
    const location = await this.table(casc, 'ArmorLocation').catch(() => null)
    const gameTable = async (id: number) => { try { return parseGameTable((await casc.file(id)).toString('utf8')) } catch { return null } }
    const ratings = await gameTable(GAME_TABLES.combatRatings), stamina = await gameTable(GAME_TABLES.stamina), socket = await gameTable(GAME_TABLES.socketCost)
    const columns = (row?: number[]): RatingColumns | null => row && row.length >= 4 ? { armor: row[0]!, weapon: row[1]!, trinket: row[2]!, jewelry: row[3]! } : null
    const floats = (row: Row, name: string) => (row[`${name}F`] ?? row[name]) as number[]
    const levels: ScalingLevel[] = [...points.values()].map(row => {
      const itemLevel = Number(row.ID), armor = total?.get(itemLevel)
      return {
        itemLevel, epic: floats(row, 'Epic'), superior: floats(row, 'Superior'), good: floats(row, 'Good'),
        damageReplace: Number(row.DamageReplaceStatF ?? row.DamageReplaceStat ?? 0), damageSecondary: Number(row.DamageSecondaryF ?? row.DamageSecondary ?? 0),
        rating: columns(ratings?.get(itemLevel)), stamina: columns(stamina?.get(itemLevel)),
        armorTotal: armor ? { cloth: Number(armor.Cloth), leather: Number(armor.Leather), mail: Number(armor.Mail), plate: Number(armor.Plate) } : null,
        armorQuality: (quality?.get(itemLevel)?.Qualitymod as number[] | undefined) ?? null, shield: (shield?.get(itemLevel)?.Quality as number[] | undefined) ?? null,
        socketCost: socket?.get(itemLevel)?.[0] ?? null,
      }
    })
    const locations = new Map<number, ArmorLocationRow>([...(location ?? new Map<number, Row>())].map(([id, row]) => [id, { cloth: Number(row.Clothmodifier), leather: Number(row.Leathermodifier), mail: Number(row.Chainmodifier), plate: Number(row.Platemodifier) }]))
    return { levels, locations }
  }

  /**
   * Upgrade-track groups each item's bonus tree can reach, with every group's item levels per rank.
   * Groups of one season share a scaling set, and each carries a track key that stays the same across
   * seasons (Adventurer, Veteran, Myth, and so on), so earlier seasons' gear can be named too
   */
  private async trackGroups(casc: LocalCasc) {
    const groupRows = await this.table(casc, 'ItemBonusListGroup', ['ItemGroupIlvlScalingID'])
    const entries = await this.table(casc, 'ItemBonusListGroupEntry', ['ItemBonusListGroupID', 'ItemBonusListID', 'SequenceValue'])
    const bonuses = await this.table(casc, 'ItemBonus', ['ParentItemBonusListID', 'Type', 'Value'])
    const configs = await this.table(casc, 'ItemScalingConfig', ['ItemLevel'])
    const levelOf = new Map<number, number>(), keyOf = new Map<number, number>()
    for (const bonus of bonuses.values()) {
      const list = Number(bonus.ParentItemBonusListID), value = bonus.Value as number[]
      if (Number(bonus.Type) === 49) { const config = configs.get(Number(value[0])); if (config) levelOf.set(list, Number(config.ItemLevel)) }
      if (Number(bonus.Type) === 34 && Number(value[1]) > 0) keyOf.set(Number(value[0]), Number(value[1]))
    }
    const ranks = new Map<number, Array<[number, number]>>()
    for (const entry of entries.values()) {
      const group = Number(entry.ItemBonusListGroupID), level = levelOf.get(Number(entry.ItemBonusListID))
      if (level) ranks.set(group, [...(ranks.get(group) ?? []), [Number(entry.SequenceValue), level]])
    }
    const groups = new Map<number, { set: number; key: number; levels: number[] }>()
    for (const [group, list] of ranks) {
      const set = Number(groupRows.get(group)?.ItemGroupIlvlScalingID ?? 0), key = keyOf.get(group)
      // Ranks past six are later extensions; the in-game track reads x/6
      if (set && key) groups.set(group, { set, key, levels: list.sort((a, b) => a[0] - b[0]).slice(0, 6).map(([, level]) => level) })
    }
    const latestSet = Math.max(0, ...[...groups.values()].map(group => group.set))
    const links = await this.table(casc, 'ItemXBonusTree')
    const nodes = new Map<number, Row[]>()
    for (const row of (await this.table(casc, 'ItemBonusTreeNode', ['ParentItemBonusTreeID', 'ChildItemBonusTreeID', 'ChildItemBonusListGroupID'])).values()) {
      const parent = Number(row.ParentItemBonusTreeID)
      nodes.set(parent, [...(nodes.get(parent) ?? []), row])
    }
    const groupsInfo = groups
    const memo = new Map<number, number[]>()
    const groupsOf = (tree: number, trail: Set<number>): number[] => {
      const known = memo.get(tree)
      if (known) return known
      if (trail.has(tree) || trail.size > 16) return []
      trail.add(tree)
      const found = new Set<number>()
      for (const node of nodes.get(tree) ?? []) {
        if (Number(node.ChildItemBonusListGroupID)) found.add(Number(node.ChildItemBonusListGroupID))
        if (Number(node.ChildItemBonusTreeID)) for (const group of groupsOf(Number(node.ChildItemBonusTreeID), trail)) found.add(group)
      }
      trail.delete(tree)
      const list = [...found].sort((a, b) => a - b)
      memo.set(tree, list)
      return list
    }
    const byItem = new Map<number, number[]>()
    for (const link of links.values()) {
      const itemId = Number(link.ItemID), groups = groupsOf(Number(link.ItemBonusTreeID), new Set())
      const tracked = groups.filter(group => groups.length && groupsInfo.has(group))
      if (tracked.length) byItem.set(itemId, [...new Set([...(byItem.get(itemId) ?? []), ...tracked])])
    }
    return { items: byItem, groups: groupsInfo, latestSet }
  }

  /** Equip and use effects of wearable items, with the spells their descriptions draw values from */
  /**
   * Crafting reagents from the newest expansion that make an item Embellished: their bonus tree carries an
   * embellishment limit's bonus list. Rank variants collapse to one entry per name
   */
  private async embellishmentTables(casc: LocalCasc, items: Map<number, Row>, sparse: Map<number, Row>) {
    const rules = embellishmentRules ?? []
    if (!rules.length) return []
    const limitOf = new Map(rules.flatMap(rule => rule.bonusLists.map(list => [list, rule.name] as const)))
    const reagents = await this.table(casc, 'ModifiedCraftingReagentItem', ['Description_lang', 'ModifiedCraftingCategoryID', 'ItemBonusTreeID'])
    const categories = await this.table(casc, 'ModifiedCraftingCategory', ['Description_lang'])
    const nodes = await this.table(casc, 'ItemBonusTreeNode', ['ParentItemBonusTreeID', 'ChildItemBonusListID'])
    const lists = new Map<number, number[]>()
    for (const node of nodes.values()) { const tree = Number(node.ParentItemBonusTreeID); lists.set(tree, [...(lists.get(tree) ?? []), Number(node.ChildItemBonusListID)]) }
    const found: Array<{ itemId: number; name: string; quality: number; icon: number | null; description: string; applies: string | null; limit: string; expansion: number; bonusLists: number[] }> = []
    for (const [id, row] of sparse) {
      const reagent = reagents.get(Number(row.ModifiedCraftingReagentItemID ?? 0))
      const base = items.get(id)
      if (!reagent || Number(base?.ClassID) !== 7) continue
      const limit = (lists.get(Number(reagent.ItemBonusTreeID)) ?? []).map(list => limitOf.get(list)).find(Boolean)
      const description = String(reagent.Description_lang ?? '').replace(/\|n/g, ' ').trim()
      if (!limit || !description) continue
      const category = String(categories.get(Number(reagent.ModifiedCraftingCategoryID))?.Description_lang ?? '')
      // "Midnight recipes for most unembellished armor." names the gear a reagent goes on
      const applies = category.match(/recipes for (?:most )?(?:unembellished )?(.+?)\.?$/i)?.[1] ?? (category.replace(/\.$/, '') || null)
      // The reagent's bonus lists are what an embellished item carries, so a simulation can add them to the item
      found.push({ itemId: id, name: cleanGameText(String(row.Display_lang ?? '')), quality: Number(row.OverallQualityID ?? 1), icon: (base?.IconFileDataID as number) || null, description, applies, limit, expansion: Number(row.ExpansionID ?? 0), bonusLists: lists.get(Number(reagent.ItemBonusTreeID)) ?? [] })
    }
    const newest = Math.max(0, ...found.map(entry => entry.expansion))
    const byName = new Map<string, (typeof found)[number]>()
    for (const entry of found.filter(entry => entry.expansion === newest).sort((a, b) => b.quality - a.quality || b.itemId - a.itemId)) if (!byName.has(entry.name)) byName.set(entry.name, entry)
    return [...byName.values()]
  }

  private async effectTables(casc: LocalCasc, items: Map<number, Row>, extraSpells: number[] = []) {
    const wearable = new Set(Object.keys(inventoryTypeNames).map(Number))
    const links = await this.table(casc, 'ItemXItemEffect')
    const itemEffects = await this.table(casc, 'ItemEffect', ['SpellID', 'TriggerType', 'CoolDownMSec', 'Charges', 'LegacySlotIndex'])
    const names = await this.table(casc, 'SpellName', ['Name_lang'])
    const texts = await this.table(casc, 'Spell', ['Description_lang'])
    const result: Array<{ itemId: number; spellId: number; trigger: number; cooldownMs: number; charges: number; position: number }> = []
    for (const link of links.values()) {
      const itemId = Number(link.ItemID), effect = itemEffects.get(Number(link.ItemEffectID))
      if (!effect || !wearable.has(Number(items.get(itemId)?.InventoryType))) continue
      result.push({ itemId, spellId: Number(effect.SpellID), trigger: Number(effect.TriggerType), cooldownMs: Number(effect.CoolDownMSec), charges: Number(effect.Charges), position: Number(effect.LegacySlotIndex ?? 0) })
    }
    // Descriptions pull durations, stacks, and values from other spells, two levels deep
    const wanted = new Set([...result.map(link => link.spellId), ...extraSpells])
    let frontier = [...wanted]
    for (let depth = 0; depth < 2 && frontier.length; depth++) {
      const next: number[] = []
      for (const id of frontier) for (const match of String(texts.get(id)?.Description_lang ?? '').matchAll(/\$(?:@spelldesc)?(\d{3,})/g)) { const ref = Number(match[1]); if (!wanted.has(ref)) { wanted.add(ref); next.push(ref) } }
      frontier = next
    }
    const spellEffects = await this.table(casc, 'SpellEffect', ['SpellID', 'EffectIndex', 'DifficultyID', 'Coefficient', 'ScalingClass', 'EffectBasePointsF', 'EffectAuraPeriod'])
    const misc = await this.table(casc, 'SpellMisc', ['SpellID', 'DifficultyID', 'DurationIndex'])
    const durations = await this.table(casc, 'SpellDuration', ['Duration'])
    const auras = await this.table(casc, 'SpellAuraOptions', ['SpellID', 'DifficultyID', 'CumulativeAura'])
    const spells = new Map<number, SpellData>()
    for (const id of wanted) { const name = names.get(id); if (name) spells.set(id, { id, name: cleanGameText(String(name.Name_lang ?? '')), description: String(texts.get(id)?.Description_lang ?? ''), durationMs: null, maxStacks: null, effects: [] }) }
    for (const row of spellEffects.values()) { const spell = spells.get(Number(row.SpellID)); if (spell && !Number(row.DifficultyID)) spell.effects.push({ index: Number(row.EffectIndex), coefficient: Number(row.Coefficient), scalingClass: Number(row.ScalingClass), basePoints: Number(row.EffectBasePointsF), periodMs: Number(row.EffectAuraPeriod) }) }
    for (const row of misc.values()) { const spell = spells.get(Number(row.SpellID)); const duration = durations.get(Number(row.DurationIndex)); if (spell && !Number(row.DifficultyID) && duration && Number(duration.Duration) > 0) spell.durationMs = Number(duration.Duration) }
    for (const row of auras.values()) { const spell = spells.get(Number(row.SpellID)); if (spell && !Number(row.DifficultyID) && Number(row.CumulativeAura) > 0) spell.maxStacks = Number(row.CumulativeAura) }
    return { links: result, spells }
  }

  private async removeOldIndexes(keep: string) {
    for (const name of await readdir(this.directory)) if (/^items-.*\.sqlite$/.test(name) && path.join(this.directory, name) !== keep) await rm(path.join(this.directory, name), { force: true }).catch(() => {})
  }

  private ready() {
    if (!this.db) throw new Error(this.status.state === 'no-install' ? 'World of Warcraft was not found on this computer' : 'Item data is still being prepared')
    return this.db
  }

  private sourcesFor(ids: number[]) {
    const map = new Map<number, ItemSource[]>()
    if (!ids.length) return map
    const rows = this.ready().prepare(`SELECT DISTINCT item_id, encounter, instance, kind FROM sources WHERE item_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{ item_id: number } & ItemSource>
    for (const row of rows) { const list = map.get(row.item_id) ?? []; if (list.length < 4) list.push({ encounter: row.encounter, instance: row.instance, kind: row.kind }); map.set(row.item_id, list) }
    return map
  }

  private summary(row: ItemRow, sources: Map<number, ItemSource[]>): ItemSummary {
    const armor = row.class_id === 4 && row.subclass_id >= 1 && row.subclass_id <= 4 && ![16].includes(row.inventory_type) ? armorTypes[row.subclass_id - 1]! : null
    return { id: row.id, name: row.name, quality: row.quality, itemLevel: row.item_level, requiredLevel: row.required_level, slot: inventoryTypeNames[row.inventory_type] ?? 'Other', inventoryType: row.inventory_type, armor, icon: row.icon, expansion: row.expansion, sources: sources.get(row.id) ?? [], classId:row.class_id, subclassId:row.subclass_id, allowableClassMask:row.allowable_class_mask??null, specIds:row.spec_ids?JSON.parse(row.spec_ids):null, primaryStats:row.primary_stats?JSON.parse(row.primary_stats):null, setPiece:!!row.item_set, catalyst:this.conversionItems ? this.conversionItems.has(row.id) : !!row.item_set, sockets:row.sockets, crafted:!!row.crafted }
  }

  search(input: ItemSearch): ItemSummary[] {
    return this.searchRows(input)
  }

  searchPage(input: ItemSearch) {
    const query = itemSearchSchema.parse(input)
    const rows = this.searchRows(query, 1)
    return { items: rows.slice(0, query.limit), nextOffset: rows.length > query.limit ? query.offset + query.limit : null }
  }

  private searchRows(input: ItemSearch, extra = 0): ItemSummary[] {
    const query = itemSearchSchema.parse(input)
    const db = this.ready()
    const where = [JUNK]
    const params: unknown[] = []
    let join = ''
    const tokens = query.text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
    if (tokens.length) { join = 'JOIN items_fts f ON f.rowid = i.id AND items_fts MATCH ?'; params.push(tokens.map(token => `"${token.replace(/"/g, '')}"*`).join(' ')) }
    const types = query.inventoryTypes ? [...query.inventoryTypes] : query.slot ? [...slotInventoryTypes[query.slot]] : null
    if (types && query.slot === 'offHand' && query.character?.className.toLowerCase() === 'warrior' && query.character.specId === 72) types.push(17)
    where.push(`i.inventory_type IN (${types ? types.join(',') : EQUIPPABLE})`)
    if (query.armor && (!query.slot || armorSlots.has(query.slot))) { where.push(`(i.inventory_type NOT IN (1,3,5,6,7,8,9,10,20) OR (i.class_id = 4 AND i.subclass_id = ?))`); params.push(armorTypes.indexOf(query.armor) + 1) }
    if (query.itemClass != null) { where.push('i.class_id = ?'); params.push(query.itemClass) }
    if (query.expansion != null) { where.push('i.expansion = ?'); params.push(query.expansion) }
    // Look filters apply once the looks index is built; until then they are left out
    if (this.looksProgress.ready && (query.effect !== 'any' || query.tags.length)) {
      join += ' JOIN temp.looks l ON l.item_id = i.id'
      if (query.effect !== 'any') where.push(`l.effect = ${query.effect === 'with' ? 1 : 0}`)
      for (const tag of query.tags) { where.push('instr(l.tags, ?) > 0'); params.push(`,${tag},`) }
    }
    if (query.itemSubclass != null) { where.push('i.subclass_id = ?'); params.push(query.itemSubclass) }
    if (query.source === 'crafted') where.push('i.crafted = 1')
    else if (query.source !== 'any') { where.push('EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND s.kind = ?)'); params.push(query.source) }
    if (query.instance) { where.push('EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND s.instance = ?)'); params.push(query.instance) }
    if (query.quality != null) { where.push('i.quality = ?'); params.push(query.quality) }
    if (query.withSocket) where.push('i.sockets > 0')
    const v3 = (this.indexVersion ?? 0) >= 3
    // A stat counts only when the item gives it a budget share, since unused slots can still name a stat
    if (query.stat !== 'any') where.push(v3 ? `EXISTS (SELECT 1 FROM json_each(i.stats, '$.t') t WHERE t.value = ${secondaryStatTypes[query.stat]} AND COALESCE(json_extract(i.stats, '$.a[' || t.key || ']'), 0) != 0)` : '0')
    if (query.withEffect) where.push(this.indexVersion === INDEX_VERSION ? 'EXISTS (SELECT 1 FROM item_effects e WHERE e.item_id = i.id)' : '0')
    // This season: on the newest upgrade tracks, in the newest season's Adventure Guide loot, or the newest expansion's epic crafted gear
    if (query.currentOnly) where.push(this.indexVersion === INDEX_VERSION
      ? "(i.latest_track = 1 OR EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND s.season > 0 AND s.season = (SELECT MAX(season) FROM sources)) OR (i.crafted = 1 AND i.quality >= 4 AND i.class_id IN (2, 4) AND i.expansion = (SELECT MAX(expansion) FROM items WHERE crafted = 1)))"
      : 'EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND (s.season = (SELECT MAX(season) FROM sources) OR i.expansion = (SELECT MAX(expansion) FROM items WHERE quality = 4 AND id IN (SELECT item_id FROM sources))))')
    // Base level is stored, so its range and order stay in SQL; the highest reachable level is worked out per row below
    const byMax = query.sort !== 'baseLevel' || (query.levelBasis === 'max' && (query.minLevel != null || query.maxLevel != null))
    if (query.levelBasis === 'base' && query.minLevel != null) { where.push('i.item_level >= ?'); params.push(query.minLevel) }
    if (query.levelBasis === 'base' && query.maxLevel != null) { where.push('i.item_level <= ?'); params.push(query.maxLevel) }
    const order = query.sort === 'baseLevel' ? 'ORDER BY i.item_level DESC, i.quality DESC, i.expansion DESC, i.id'
      : tokens.length ? 'ORDER BY bm25(items_fts), i.expansion DESC, i.item_level DESC, i.id' : 'ORDER BY i.expansion DESC, i.item_level DESC, i.quality DESC, i.id'
    if (byMax) return this.searchByMaxLevel(query, `SELECT i.* FROM items i ${join} WHERE ${where.join(' AND ')} ${order}`, params, extra)
    const statement = db.prepare(`SELECT i.* FROM items i ${join} WHERE ${where.join(' AND ')} ${order} LIMIT ? OFFSET ?`)
    const seen = new Set<string>()
    const unique: ItemRow[] = []
    let skipped = 0
    const target = query.limit + extra
    const pageSize = Math.max(100,query.limit*3)
    for (let offset=0; unique.length<target; offset+=pageSize) {
      const rows = statement.all(...params,pageSize,offset) as ItemRow[]
      for (const row of rows) {
        if (!getItemCompatibility(this.summary(row,new Map()),query.character,{slot:query.slot}).compatible) continue
        const key = `${row.name}|${row.inventory_type}`
        if (seen.has(key)) continue
        seen.add(key)
        if (skipped++ < query.offset) continue
        unique.push(row)
        if (unique.length === target) break
      }
      if (rows.length<pageSize) break
    }
    const sources = this.sourcesFor(unique.map(row => row.id))
    return unique.map(row => this.summary(row, sources))
  }

  /** The highest level an item reaches, by the same rules as the level shown on each result */
  maxItemLevel(row: Pick<ItemRow, 'id' | 'item_level' | 'track_groups' | 'inventory_type' | 'item_set'>) {
    const groups = row.track_groups ? JSON.parse(row.track_groups) as number[] : null
    let info = null
    if (groups?.length && this.indexVersion === INDEX_VERSION) {
      if (!this.groupCache) {
        const rows = this.ready().prepare('SELECT group_id, scaling_set, track_key, levels FROM track_groups').all() as Array<{ group_id: number; scaling_set: number; track_key: number; levels: string }>
        const latest = Math.max(0, ...rows.map(entry => entry.scaling_set))
        this.groupCache = new Map(rows.map(entry => [entry.group_id, { group: entry.group_id, set: entry.scaling_set, key: entry.track_key, levels: JSON.parse(entry.levels) as number[], latest: entry.scaling_set === latest }]))
      }
      info = groups.flatMap(group => { const found = this.groupCache!.get(group); return found ? [found] : [] })
    }
    this.elevatedCache ??= this.elevatedSources()
    const ascension = { inventoryType: row.inventory_type, encounters: this.elevatedCache.get(row.id) ?? [], setPiece: !!row.item_set }
    return itemTracks(row.id, groups, info, ascension)?.max.itemLevel ?? row.item_level
  }

  private elevatedSources() {
    const map = new Map<number, string[]>()
    if (!elevatedEncounters.length) return map
    const rows = this.ready().prepare(`SELECT DISTINCT item_id, encounter FROM sources WHERE encounter IN (${elevatedEncounters.map(() => '?').join(',')})`).all(...elevatedEncounters) as Array<{ item_id: number; encounter: string }>
    for (const row of rows) map.set(row.item_id, [...(map.get(row.item_id) ?? []), row.encounter])
    return map
  }

  /** Sorting or filtering by highest level needs every match, since that level isn't stored */
  private searchByMaxLevel(query: ReturnType<typeof itemSearchSchema.parse>, sql: string, params: unknown[], extra: number): ItemSummary[] {
    const seen = new Set<string>()
    const matches: Array<{ row: ItemRow; level: number; fit: number; order: number }> = []
    for (const row of this.ready().prepare(sql).iterate(...params) as Iterable<ItemRow>) {
      const key = `${row.name}|${row.inventory_type}`
      if (seen.has(key) || !getItemCompatibility(this.summary(row, new Map()), query.character, { slot: query.slot }).compatible) continue
      seen.add(key)
      const level = query.levelBasis === 'max' || query.sort !== 'baseLevel' ? this.maxItemLevel(row) : row.item_level
      if (query.levelBasis === 'max' && ((query.minLevel != null && level < query.minLevel) || (query.maxLevel != null && level > query.maxLevel))) continue
      matches.push({ row, level, fit: query.sort === 'relevance' ? statFit(row, query.weights) : 0, order: matches.length })
    }
    if (query.sort === 'maxLevel') matches.sort((a, b) => b.level - a.level || a.order - b.order)
    // Best match: the highest level first, then the secondary stats this character values most, then the name match
    if (query.sort === 'relevance') matches.sort((a, b) => b.level - a.level || b.fit - a.fit || a.order - b.order)
    const page = matches.slice(query.offset, query.offset + query.limit + extra).map(match => match.row)
    const sources = this.sourcesFor(page.map(row => row.id))
    return page.map(row => this.summary(row, sources))
  }

  item(id: number): ItemDetail | null {
    const db = this.ready()
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
    if (!row) return null
    const sources = this.sourcesFor([id])
    const appearances = db.prepare('SELECT modified_id, appearance_id, modifier, icon FROM appearances WHERE item_id = ? ORDER BY modifier').all(id) as Array<{ modified_id: number; appearance_id: number; modifier: number; icon: number | null }>
    return { ...this.summary(row, sources), trackGroups: row.track_groups ? JSON.parse(row.track_groups) as number[] : null, trackInfo: this.trackInfo(row.track_groups), classId: row.class_id, subclassId: row.subclass_id, bonding: bondingNames[row.bonding] ?? null, sockets: row.sockets, description: row.description, appearances: appearances.map(a => ({ modifiedAppearanceId: a.modified_id, appearanceId: a.appearance_id, modifier: a.modifier, icon: a.icon })) }
  }

  /** Track groups and their levels for a page of items, so search rows can show how high each item goes */
  trackInfoFor(ids: number[]): Record<number, { groups: number[]; info: ReturnType<GameDataEngine['trackInfo']> }> {
    const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 200)
    if (!unique.length || this.indexVersion !== INDEX_VERSION) return {}
    const rows = this.ready().prepare(`SELECT id, track_groups FROM items WHERE id IN (${unique.map(() => '?').join(',')}) AND track_groups IS NOT NULL`).all(...unique) as Array<{ id: number; track_groups: string }>
    return Object.fromEntries(rows.map(row => [row.id, { groups: JSON.parse(row.track_groups) as number[], info: this.trackInfo(row.track_groups) }]))
  }

  private trackInfo(json: string | null | undefined) {
    if (!json || this.indexVersion !== INDEX_VERSION) return null
    const db = this.ready(), groups = JSON.parse(json) as number[]
    const rows = db.prepare(`SELECT group_id, scaling_set, track_key, levels FROM track_groups WHERE group_id IN (${groups.map(() => '?').join(',')})`).all(...groups) as Array<{ group_id: number; scaling_set: number; track_key: number; levels: string }>
    const latest = (db.prepare('SELECT MAX(scaling_set) AS s FROM track_groups').get() as { s: number | null }).s
    return rows.map(row => ({ group: row.group_id, set: row.scaling_set, key: row.track_key, levels: JSON.parse(row.levels) as number[], latest: row.scaling_set === latest }))
  }

  /** Stats, armour, and effects of an item at one item level, from the game's own scaling tables */
  itemPower(id: number, itemLevel: number): ItemPower | null {
    const db = this.ready()
    if (this.indexVersion !== INDEX_VERSION) return null
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
    const scalingRow = db.prepare('SELECT data FROM scaling WHERE item_level = ?').get(Math.round(itemLevel)) as { data: string } | undefined
    if (!row || !scalingRow) return null
    const parsed = row.stats ? JSON.parse(row.stats) as { t: number[]; a: number[]; s: number[] } : { t: [], a: [], s: [] }
    // Power is shown at epic quality: every current-season track item drops as epic
    const block: ItemStatBlock = { statTypes: parsed.t, alloc: parsed.a, socketShare: parsed.s, inventoryType: row.inventory_type, classId: row.class_id, subclassId: row.subclass_id, quality: Math.max(row.quality, 4) }
    const level = JSON.parse(scalingRow.data) as ScalingLevel
    const location = db.prepare('SELECT data FROM armor_locations WHERE inventory_type = ?').get(row.inventory_type) as { data: string } | undefined
    const links = db.prepare('SELECT spell_id, trigger_type, cooldown_ms, charges FROM item_effects WHERE item_id = ? ORDER BY position').all(id) as Array<{ spell_id: number; trigger_type: number; cooldown_ms: number; charges: number }>
    const effects: ItemEffectData[] = links.map(link => ({ spellId: link.spell_id, trigger: link.trigger_type, cooldownMs: link.cooldown_ms, charges: link.charges }))
    const spells = new Map<number, SpellData>()
    const load = (spellId: number, depth: number) => {
      if (spells.has(spellId) || depth > 2) return
      const found = db.prepare('SELECT data FROM spells WHERE id = ?').get(spellId) as { data: string } | undefined
      if (!found) return
      const spell = JSON.parse(found.data) as SpellData
      spells.set(spellId, spell)
      for (const match of spell.description.matchAll(/\$(?:@spelldesc)?(\d{3,})/g)) load(Number(match[1]), depth + 1)
    }
    for (const effect of effects) load(effect.spellId, 0)
    const cleaned = scaledEffects(effects, spells, block, level).map(effect => ({ ...effect, text: cleanGameText(effect.text) }))
    return { itemLevel: level.itemLevel, armor: scaledArmor(block, level, location ? JSON.parse(location.data) as ArmorLocationRow : null), stats: scaledStats(block, level), effects: cleaned, setPiece: !!row.item_set }
  }

  /** Effects for a page of search results, each at the level its row shows; items without effects are left out */
  effectsFor(entries: Array<{ id: number; itemLevel: number }>): Record<number, ItemPower['effects']> {
    const wanted = entries.filter(entry => Number.isInteger(entry.id) && entry.id > 0 && entry.itemLevel > 0).slice(0, 200)
    if (!wanted.length || this.indexVersion !== INDEX_VERSION) return {}
    const ids = [...new Set(wanted.map(entry => entry.id))]
    const withEffects = new Set((this.ready().prepare(`SELECT DISTINCT item_id FROM item_effects WHERE item_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{ item_id: number }>).map(row => row.item_id))
    const result: Record<number, ItemPower['effects']> = {}
    for (const entry of wanted) {
      if (!withEffects.has(entry.id) || result[entry.id]) continue
      const effects = this.itemPower(entry.id, entry.itemLevel)?.effects
      if (effects?.length) result[entry.id] = effects
    }
    return result
  }

  /** How many items share each boss's loot with this one, for everyone and for the selected character */
  lootShare(id: number, character: ItemSearchCharacter | null): ItemLootShare[] {
    const db = this.ready()
    const bosses = db.prepare('SELECT DISTINCT encounter, instance, kind FROM sources WHERE item_id = ? LIMIT 4').all(id) as Array<{ encounter: string; instance: string; kind: ItemSource['kind'] }>
    return bosses.map(boss => {
      const rows = db.prepare(`SELECT DISTINCT i.* FROM sources s JOIN items i ON i.id = s.item_id WHERE s.encounter = ? AND s.instance = ? AND i.inventory_type IN (${EQUIPPABLE})`).all(boss.encounter, boss.instance) as ItemRow[]
      const unique = new Map(rows.map(row => [`${row.name}|${row.inventory_type}`, row]))
      const forCharacter = character ? [...unique.values()].filter(row => getItemCompatibility(this.summary(row, new Map()), character).compatible).length : null
      return { ...boss, total: unique.size, forCharacter }
    })
  }

  items(ids: number[]): ItemSummary[] {
    const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 200)
    if (!unique.length) return []
    const rows = this.ready().prepare(`SELECT * FROM items WHERE id IN (${unique.map(() => '?').join(',')})`).all(...unique) as ItemRow[]
    const sources = this.sourcesFor(rows.map(row => row.id))
    return rows.map(row => this.summary(row, sources))
  }

  /** Dungeons and raids that drop gear, newest season first when only this season is wanted */
  instances(currentOnly: boolean): ItemInstance[] {
    // Same rule as the season filter on results: on this season's tracks, or in this season's Adventure Guide loot
    const season = !currentOnly ? '' : this.indexVersion === INDEX_VERSION
      ? 'JOIN items i ON i.id = s.item_id WHERE i.latest_track = 1 OR (s.season > 0 AND s.season = (SELECT MAX(season) FROM sources))'
      : 'WHERE s.season > 0 AND s.season = (SELECT MAX(season) FROM sources)'
    const rows = this.ready().prepare(`SELECT s.instance AS name, MIN(s.kind) AS kind FROM sources s ${season} GROUP BY s.instance ORDER BY MIN(s.kind) DESC, s.instance`).all() as ItemInstance[]
    return rows.filter(row => row.name)
  }

  /** Current-expansion enchant scrolls for a slot, or gems; rank variants collapse to the best quality */
  /** Gear slots with an enchant from the newest expansion */
  enchantSlots(): AppearanceSlot[] {
    const db = this.ready()
    const rows = db.prepare(`SELECT DISTINCT subclass_id FROM items i WHERE class_id = 8 AND quality >= 2 AND expansion = (SELECT MAX(expansion) FROM items WHERE class_id = 8) AND ${JUNK}`).all() as Array<{ subclass_id: number }>
    const current = new Set(rows.map(row => row.subclass_id))
    return (Object.entries(enchantSubclasses) as Array<[AppearanceSlot, number[]]>).flatMap(([slot, subclasses]) => subclasses.some(subclass => current.has(subclass)) ? [slot] : [])
  }

  enhancements(kind: 'enchant' | 'gem', slot: AppearanceSlot | null): EnhancementOption[] {
    const db = this.ready()
    const filter = kind === 'gem' ? 'class_id = 3' : `class_id = 8 AND subclass_id IN (${(slot && enchantSubclasses[slot]) ? enchantSubclasses[slot]!.join(',') : '-1'})`
    // A slot with no enchants from the newest expansion can't be enchanted this season, so older ones aren't offered
    const latest = (db.prepare(`SELECT MAX(expansion) AS e FROM items i WHERE ${kind === 'gem' ? filter : 'class_id = 8'} AND ${JUNK}`).get() as { e: number | null }).e
    if (latest == null) return []
    const rows = db.prepare(`SELECT id, name, quality, icon FROM items i WHERE ${filter} AND expansion = ? AND quality >= 2 AND ${JUNK} ORDER BY quality DESC, id DESC`).all(latest) as Array<{ id: number; name: string; quality: number; icon: number | null }>
    const seen = new Set<string>()
    return rows.flatMap(row => {
      const name = kind === 'enchant' ? row.name.replace(/^(Enchant|Enchanting)\s[^-]+-\s*/i, '') : row.name
      if (seen.has(name)) return []
      seen.add(name)
      return [{ itemId: row.id, name, quality: row.quality, icon: row.icon }]
    }).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Death Knight runeforges. They're spells rather than enchant scrolls, so no item lists them; each comes from the spell
   * that applies its enchant (SpellEffect 53), with that spell's icon and description
   */
  private runeforgeList: Promise<EnhancementOption[]> | null = null
  runeforges(): Promise<EnhancementOption[]> {
    this.runeforgeList ??= (async () => {
      const db = this.ready()
      const named = db.prepare(`SELECT id, name, icon FROM enchants WHERE id IN (${runeforgeIds.join(',')})`).all() as Array<{ id: number; name: string; icon: number | null }>
      const [effects, names, misc] = await Promise.all([this.traitTable('SpellEffect'), this.traitTable('SpellName'), this.traitTable('SpellMisc')])
      const wanted = new Set(runeforgeIds)
      const spellOf = new Map<number, number>()
      for (const row of effects.values()) {
        const value = row.EffectMiscValue, enchant = Number(Array.isArray(value) ? value[0] : value), spell = Number(row.SpellID)
        // The runeforging spell shares the rune's name; other spells that apply it (such as old item effects) don't
        if (Number(row.Effect) === 53 && wanted.has(enchant) && String(names.get(spell)?.Name_lang ?? '') === named.find(rune => rune.id === enchant)?.name) spellOf.set(enchant, Math.max(spellOf.get(enchant) ?? 0, spell))
      }
      const icons = new Map<number, number>()
      for (const row of misc.values()) if (!Number(row.DifficultyID) && Number(row.SpellIconFileDataID) > 0) icons.set(Number(row.SpellID), Number(row.SpellIconFileDataID))
      const spells = await talentSpells(name => this.traitTable(name), [...spellOf.values()])
      const map = new Map(Object.entries(spells).map(([id, spell]) => [Number(id), spell]))
      const noItem: ItemStatBlock = { statTypes: [], alloc: [], socketShare: [], inventoryType: 0, classId: 0, subclassId: 0, quality: 4 }
      const noLevel: ScalingLevel = { itemLevel: 0, epic: [], superior: [], good: [], damageReplace: 0, damageSecondary: 0, rating: null, stamina: null, armorTotal: null, armorQuality: null, shield: null, socketCost: null }
      return named.map(rune => {
        const spell = spellOf.get(rune.id)
        // A value scaled by attack power can't be read from the files, so it's left out rather than shown as ?%
        const effect = spell ? cleanGameText(effectText(spell, map, noItem, noLevel).text).replace(/\?% /g, '').replace(/\s+/g, ' ').trim() : ''
        return { itemId: -rune.id, enchantId: rune.id, name: rune.name, quality: 1, icon: (spell ? icons.get(spell) : undefined) ?? rune.icon, effect }
      }).sort((a, b) => a.name.localeCompare(b.name))
    })()
    this.runeforgeList.catch(() => { this.runeforgeList = null })
    return this.runeforgeList
  }

  /** Every bonus list an item's drops can carry, read from its bonus trees (nested trees and list groups included) */
  private bonusTrees: Promise<(itemId: number) => number[]> | null = null
  private dropBonusLists(): Promise<(itemId: number) => number[]> {
    this.bonusTrees ??= (async () => {
      const [links, nodes, groups] = await Promise.all([this.traitTable('ItemXBonusTree'), this.traitTable('ItemBonusTreeNode'), this.traitTable('ItemBonusListGroupEntry')])
      const treesOf = new Map<number, number[]>()
      for (const row of links.values()) { const item = Number(row.ItemID); treesOf.set(item, [...(treesOf.get(item) ?? []), Number(row.ItemBonusTreeID)]) }
      const children = new Map<number, Row[]>()
      for (const row of nodes.values()) { const parent = Number(row.ParentItemBonusTreeID); children.set(parent, [...(children.get(parent) ?? []), row]) }
      const groupLists = new Map<number, number[]>()
      for (const row of groups.values()) { const group = Number(row.ItemBonusListGroupID); groupLists.set(group, [...(groupLists.get(group) ?? []), Number(row.ItemBonusListID)]) }
      return (itemId: number) => {
        const lists = new Set<number>(), seen = new Set<number>()
        const walk = (tree: number) => {
          if (seen.has(tree)) return
          seen.add(tree)
          for (const node of children.get(tree) ?? []) {
            if (Number(node.ChildItemBonusListID)) lists.add(Number(node.ChildItemBonusListID))
            if (Number(node.ChildItemBonusTreeID)) walk(Number(node.ChildItemBonusTreeID))
            for (const list of groupLists.get(Number(node.ChildItemBonusListGroupID)) ?? []) lists.add(list)
          }
        }
        for (const tree of treesOf.get(itemId) ?? []) walk(tree)
        return [...lists]
      }
    })()
    this.bonusTrees.catch(() => { this.bonusTrees = null })
    return this.bonusTrees
  }

  /**
   * Items the Catalyst makes: every season's tier set pieces plus the off-slot pieces (cloak, wrist, waist, feet) that
   * share the set's look but carry no set bonus
   */
  private catalystItems() {
    this.conversionLoad ??= this.traitTable('ItemConversionEntry').then(rows => {
      const items = new Set([...rows.values()].map(row => Number(row.ItemID)).filter(id => id > 0))
      this.conversionItems = items
      return items
    })
    this.conversionLoad.catch(() => { this.conversionLoad = null })
    return this.conversionLoad
  }

  /**
   * This season's items the Catalyst can turn into the given tier piece: the same slot and armor type, not crafted.
   * Catalyzing keeps the base's secondary stats and any cantrip its drop carries (such as Corroded Hulk's Skullcap with
   * Void Eruption), so each base lists both. Bases with a cantrip come first
   */
  /**
   * A dungeon's bosses from the game's Encounter Journal: Blizzard's overview and per-role advice, and every ability with
   * its icon, warnings (interruptible, magic, deadly…), and description filled in from spell data. Only text that
   * applies to Mythic+ (difficulty 8) is kept. The instance is matched by the encounters Raider.IO lists, then by name
   */
  async dungeonJournal(name: string, encounterIds: number[] = [], difficulty: JournalDifficulty = 'mythicPlus'): Promise<DungeonJournal | null> {
    const wantedDifficulties = journalDifficultyIds[difficulty]
    const [instances, encounters, sections, perDifficulty, creatures] = await Promise.all(['JournalInstance', 'JournalEncounter', 'JournalEncounterSection', 'JournalSectionXDifficulty', 'JournalEncounterCreature'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const wanted = new Set(encounterIds)
    const fromIds = [...encounters.values()].find(row => wanted.has(num(row.ID)))
    const instance = (fromIds ? instances.get(num(fromIds.JournalInstanceID)) : undefined)
      ?? [...instances.values()].filter(row => dungeonKey(String(row.Name_lang ?? '')) === dungeonKey(name)).sort((a, b) => num(b.ID) - num(a.ID))[0]
    if (!instance) return null
    const instanceId = num(instance.ID)
    const bosses = [...encounters.values()].filter(row => num(row.JournalInstanceID) === instanceId)
    const order = (id: number) => { const at = encounterIds.indexOf(id); return at < 0 ? 1000 : at }
    bosses.sort((a, b) => order(num(a.ID)) - order(num(b.ID)) || num(a.OrderIndex) - num(b.OrderIndex))
    const difficulties = new Map<number, number[]>()
    for (const row of perDifficulty.values()) { const id = num(row.JournalEncounterSectionID); difficulties.set(id, [...(difficulties.get(id) ?? []), num(row.DifficultyID)]) }
    // Sections tied to difficulties count only when the chosen one is among them, such as Mythic (23) or Mythic+ (8) for dungeons
    const applies = (id: number) => { const list = difficulties.get(id); return !list || list.some(entry => wantedDifficulties.includes(entry)) }
    // Every difficulty the journal tags in this instance, so a page offers only the ones the encounters have
    const bossIds = new Set(bosses.map(boss => num(boss.ID)))
    const tagged = new Set<number>()
    for (const row of sections.values()) if (bossIds.has(num(row.JournalEncounterID))) for (const id of difficulties.get(num(row.ID)) ?? []) tagged.add(id)
    const walk = (first: number, visit: (row: Row, depth: number) => void, depth = 0) => {
      for (let id = first, guard = 0; id && guard < 500; guard++) {
        const row = sections.get(id)
        if (!row) return
        if (applies(id)) visit(row, depth)
        id = num(row.NextSiblingSectionID)
      }
    }
    // Spells named by abilities and by the text, read once
    const spellIds = new Set<number>()
    for (const boss of bosses) {
      const collect = (row: Row) => {
        if (num(row.SpellID)) spellIds.add(num(row.SpellID))
        for (const match of String(row.BodyText_lang ?? '').matchAll(/\$(\d{3,})/g)) spellIds.add(Number(match[1]))
        walk(num(row.FirstChildSectionID), collect)
      }
      walk(num(boss.FirstSectionID), collect)
    }
    const { map, iconOf, fill } = await this.journalSpells(spellIds)
    const spellText = (id: number) => map.has(id) ? fill(map.get(id)!.description, id) : ''
    const ability = (row: Row): JournalAbility => {
      const spell = num(row.SpellID)
      const children: JournalAbility[] = []
      walk(num(row.FirstChildSectionID), child => { const entry = ability(child); if (entry.name || entry.text) children.push(entry) })
      return {
        id: num(row.ID),
        name: (placeholderTitle(String(row.Title_lang ?? '')) ? map.get(spell)?.name : String(row.Title_lang).trim()) || '',
        text: fill(String(row.BodyText_lang ?? ''), spell) || spellText(spell),
        icon: num(row.IconFileDataID) || iconOf.get(spell) || null,
        flags: journalFlags(num(row.IconFlags)),
        children,
      }
    }
    const roleOf = (flags: JournalFlag[]): JournalRole | null => flags.includes('tank') ? 'tank' : flags.includes('healer') ? 'healer' : flags.includes('damage') ? 'damage' : null
    return {
      instanceId,
      name: String(instance.Name_lang ?? name),
      description: journalText(String(instance.Description_lang ?? '')),
      button: num(instance.ButtonFileDataID) || null,
      background: num(instance.BackgroundFileDataID) || null,
      difficultyIds: [...tagged].sort((x, y) => x - y),
      bosses: bosses.map(boss => {
        const tips: JournalBoss['tips'] = []
        const abilities: JournalAbility[] = []
        let overview = ''
        walk(num(boss.FirstSectionID), row => {
          // Type 3 is the overview: its own text sums the fight up and its children are the per-role advice
          if (num(row.Type) === 3) {
            overview = fill(String(row.BodyText_lang ?? ''))
            walk(num(row.FirstChildSectionID), tip => { const role = roleOf(journalFlags(num(tip.IconFlags))); const text = fill(String(tip.BodyText_lang ?? '')); if (role && text) tips.push({ role, text }) })
            return
          }
          const entry = ability(row)
          if (entry.name || entry.text || entry.children.length) abilities.push(entry)
        })
        const portrait = [...creatures.values()].filter(row => num(row.JournalEncounterID) === num(boss.ID)).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex))[0]
        return { encounterId: num(boss.ID), name: String(boss.Name_lang ?? ''), description: journalText(String(boss.Description_lang ?? '')), portrait: num(portrait?.FileDataID) || null, tips, overview, abilities }
      }),
    }
  }

  /** Spells for journal and enemy text, with the spells their text links to a few links deep, and their icons */
  private async journalSpells(spellIds: Set<number>) {
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const table = (tableName: string) => this.traitTable(tableName)
    const spells: Record<number, SpellData> = {}
    let frontier = [...spellIds]
    for (let round = 0; round < 3 && frontier.length; round++) {
      Object.assign(spells, await talentSpells(table, frontier))
      const next = new Set<number>()
      for (const spell of Object.values(spells)) for (const match of spell.description.matchAll(/$(?:@spellname|@spelldesc)?(d{3,})/g)) { const id = Number(match[1]); if (!spells[id]) next.add(id) }
      frontier = [...next]
    }
    const misc = await this.traitTable('SpellMisc')
    const map = new Map<number, JournalSpell>(Object.entries(spells).map(([id, spell]) => [Number(id), { name: spell.name, description: spell.description, durationMs: spell.durationMs, effects: spell.effects.map(effect => ({ index: effect.index, periodMs: effect.periodMs ?? 0, basePoints: effect.basePoints })) }]))
    const iconOf = new Map<number, number>()
    for (const row of misc.values()) { const spell = num(row.SpellID); if (spellIds.has(spell) && !num(row.DifficultyID) && num(row.SpellIconFileDataID)) iconOf.set(spell, num(row.SpellIconFileDataID)) }
    const fill = (raw: string, spell = 0) => journalSpellText(journalText(raw), spell, map)
    return { map, iconOf, fill }
  }

  /**
   * The journal instances that hold these bosses, matched by name, in the order they first appear, each with its
   * loading-screen art. Raider.IO files some tiers as one raid (such as "MN Tier 1 (VS / DR / MQD)") that the journal
   * keeps as separate instances
   */
  async raidInstances(encounterNames: string[]): Promise<Array<{ instanceId: number; name: string; art: number | null; matched: string[] }>> {
    const [instances, encounters, maps, screens] = await Promise.all(['JournalInstance', 'JournalEncounter', 'Map', 'LoadingScreens'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const found = new Map<number, string[]>()
    for (const name of encounterNames) {
      // The newest encounter of that name, since an old raid can share a boss name
      const row = [...encounters.values()].filter(entry => dungeonKey(String(entry.Name_lang ?? '')) === dungeonKey(name)).sort((a, b) => num(b.ID) - num(a.ID))[0]
      if (!row) continue
      const id = num(row.JournalInstanceID)
      found.set(id, [...(found.get(id) ?? []), name])
    }
    return [...found].flatMap(([instanceId, matched]) => {
      const instance = instances.get(instanceId)
      if (!instance) return []
      const screen = screens.get(num(maps.get(num(instance.MapID))?.LoadingScreenID))
      const art = num(screen?.MainImageFileDataID) || num(screen?.WideScreen169FileDataID) || null
      return [{ instanceId, name: String(instance.Name_lang ?? ''), art, matched }]
    })
  }

  private models = new Map<string, Promise<unknown>>()

  /** Keeps a handful of recent models; each is read again quickly when reopened */
  private remember<T>(key: string, read: () => Promise<T>): Promise<T> {
    let pending = this.models.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = read()
      this.models.set(key, pending)
      pending.catch(() => this.models.delete(key))
      if (this.models.size > 16) this.models.delete(this.models.keys().next().value!)
    }
    return pending
  }

  /** One model file read with its first skin; `geosets` keeps only those body pieces */
  private async modelPart(file: number, textureFor: (type: number, txid: number) => number | null, options: { geosets?: (available: Set<number>) => Set<number>; animations?: number[]; particleColor?: number } = {}): Promise<ModelPart | null> {
    const casc = await this.openCasc()
    const m2 = readM2File(await casc.file(file))
    const skinId = m2.skins[0]
    if (!skinId) return null
    const skin = await casc.file(skinId)
    const geosets = options.geosets?.(new Set(readSkin(skin).sections.map(section => section.id)))
    return readM2(m2, file, { skin, textureFor, file: id => casc.file(id), geosets, animations: options.animations, particleColors: options.particleColor ? await this.particleColors(options.particleColor) : undefined })
  }

  /** A display's particle colours from ParticleColor: start, middle, and end for each of its three slots, as RGB */
  private async particleColors(id: number): Promise<Array<[number[], number[], number[]]>> {
    const row = (await this.traitTable('ParticleColor')).get(id)
    if (!row) return []
    const rgb = (value: unknown) => { const v = Number(value) >>> 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }
    const list = (value: unknown) => (Array.isArray(value) ? value : [value])
    const start = list(row.Start), middle = list(row.MID ?? row.Mid), end = list(row.End)
    return [0, 1, 2].map(i => [rgb(start[i]), rgb(middle[i]), rgb(end[i])] as [number[], number[], number[]])
  }

  /** An item's base appearance: its display row with the tables that resolve its models and textures */
  private async itemDisplay(itemId: number | null, modifiedAppearanceId: number | null = null, appearanceId: number | null = null, look?: CharacterModelLook) {
    const [modified, appearances, displays, models, textures, components, componentTextures, modelMaterials] = await Promise.all(['ItemModifiedAppearance', 'ItemAppearance', 'ItemDisplayInfo', 'ModelFileData', 'TextureFileData', 'ComponentModelFileData', 'ComponentTextureFileData', 'ItemDisplayInfoModelMatRes'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const list = (value: unknown) => (Array.isArray(value) ? value : [value]).map(entry => Number(entry) || 0)
    const base = modifiedAppearanceId !== null
      ? modified.get(modifiedAppearanceId)
      : itemId !== null ? [...modified.values()].filter(row => num(row.ItemID) === itemId && (appearanceId === null || num(row.ItemAppearanceID) === appearanceId)).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex))[0] : undefined
    const display = displays.get(num(appearances.get(num(base?.ItemAppearanceID))?.ItemDisplayInfoID))
    if (!display) return null
    const race = look?.raceId ?? 1
    const gender = look?.sex === 'female' ? 1 : 0
    const modelFile = (resource: number, slot: number) => {
      const files = [...models.values()].filter(row => num(row.ModelResourcesID) === resource)
      const entry = (row: Row) => components.get(num(row.FileDataID))
      const fits = (row: Row) => { const found = entry(row); return !found || num(found.PositionIndex) < 0 || num(found.PositionIndex) === slot }
      const match = (row: Row) => { const found = entry(row); return !!found && num(found.RaceID) === race && num(found.GenderIndex) === gender }
      return num((files.find(row => fits(row) && match(row)) ?? files.find(row => fits(row) && !entry(row)) ?? files.find(fits) ?? files[0])?.FileDataID) || null
    }
    const textureFile = (material: number) => {
      if (!material) return null
      const files = [...textures.values()].filter(row => num(row.MaterialResourcesID) === material)
      const score = (row: Row) => {
        const found = componentTextures.get(num(row.FileDataID))
        if (!found) return 2
        const variantRace = num(found.RaceID), variantGender = num(found.GenderIndex)
        return (variantRace === race ? 8 : variantRace === 0 ? 4 : 0) + (variantGender === gender ? 2 : variantGender === 3 ? 1 : -4)
      }
      return num(files.sort((a, b) => score(b) - score(a))[0]?.FileDataID) || null
    }
    const materials = list(display.ModelMaterialResourcesID)
    // Each model's textures by the type its batches ask for, such as 3 and 4 for a weapon's glow layers; wow.export reads
    // them the same way. Type 2 falls back to the display's own material
    const typed = [...modelMaterials.values()].filter(row => num(row.ItemDisplayInfoID) === num(display.ID))
    const slotTexture = (slot: number, type: number) => {
      const row = typed.find(entry => num(entry.ModelIndex) === slot && num(entry.TextureType) === type) ?? typed.find(entry => num(entry.TextureType) === type)
      if (row) return textureFile(num(row.MaterialResourcesID))
      return type === 2 ? textureFile(materials[slot] || materials[0] || 0) : null
    }
    return { itemId: num(base?.ItemID), display, resources: list(display.ModelResourcesID), materials, geosetGroup: list(display.GeosetGroup), particleColor: num(display.ParticleColorID), modelFile, textureFile, slotTexture }
  }

  /**
   * An item's 3D models from the game files, for the item viewer: each model of its base appearance with the item's
   * textures, bones, and animations. Armor drawn only as a texture on the body, and rings, trinkets, and necks, have no
   * model of their own
   */
  itemModel(itemId: number, modifiedAppearanceId: number | null = null): Promise<ItemModel | null> {
    if (!Number.isInteger(itemId) || itemId <= 0) return Promise.reject(new Error('Invalid item'))
    return this.remember(`item:${itemId}:${modifiedAppearanceId}`, async () => {
      const found = await this.itemDisplay(itemId, modifiedAppearanceId)
      if (!found || found.itemId !== itemId) return null
      const parts: ModelPart[] = []
      // Shoulders have a model per side; other items show their main model, since a helmet's second one is a variant
      const shown = this.item(itemId)?.inventoryType === 3 ? found.resources : found.resources.slice(0, 1)
      for (const [slot, resource] of shown.entries()) {
        const file = resource ? found.modelFile(resource, slot) : null
        if (!file) continue
        // Texture type 0 is a file named by the model; the display fills the others, such as the item's own texture (2) and
        // glow layers (3 and 4). A type the display leaves out stays empty
        try { const part = await this.modelPart(file, (type, txid) => type === 0 ? txid || null : found.slotTexture(slot, type), { particleColor: found.particleColor }); if (part) parts.push(part) } catch { /* a model this build can't read is left out */ }
      }
      return parts.length ? { itemId, parts } : null
    })
  }

  /**
   * A stand-in human male wearing one item: the body pieces the item switches on, its textures for each body section,
   * and its models on the hands, shoulders, head, or back. The body has no skin or hair textures of its own
   */
  wornModel(itemId: number, look?: CharacterModelLook): Promise<WornModel | null> {
    if (!Number.isInteger(itemId) || itemId <= 0) return Promise.reject(new Error('Invalid item'))
    return this.remember(`worn:${itemId}:${JSON.stringify(look)}`, async () => {
      const found = await this.itemDisplay(itemId, null, null, look)
      const detail = this.item(itemId)
      if (!found || !detail) return null
      const result = await this.dressedModel([{ found, inventoryType: detail.inventoryType, subclassId: detail.subclassId, slot: undefined }], look)
      return result ? { ...result.model, itemId } : null
    })
  }

  /** Resolve exact appearance sources before painting the pieces together on the viewer's stand-in */
  outfitModel(pieces: OutfitModelPiece[], look?: CharacterModelLook): Promise<OutfitModel | null> {
    const ordered = [...pieces].sort((a, b) => outfitLayerOrder.indexOf(a.slot) - outfitLayerOrder.indexOf(b.slot))
    return this.remember(`outfit:${JSON.stringify([look, ordered])}`, async () => {
      const unavailable: AppearanceSlot[] = []
      const resolved = await Promise.all(ordered.map(async piece => {
        const found = await this.itemDisplay(piece.itemId, piece.modifiedAppearanceId, piece.appearanceId, look)
        const detail = found?.itemId ? this.item(found.itemId) : null
        if (!found || !detail || !wearableTypes.has(detail.inventoryType) || !slotInventoryTypes[piece.slot]?.includes(detail.inventoryType)) {
          unavailable.push(piece.slot)
          return null
        }
        return { found, inventoryType: detail.inventoryType, subclassId: detail.subclassId, slot: piece.slot }
      }))
      const result = await this.dressedModel(resolved.filter(piece => piece != null), look)
      return result ? { ...result.model, unavailable: [...unavailable, ...result.unavailable] } : null
    })
  }

  private async dressedModel(pieces: Array<{ found: NonNullable<Awaited<ReturnType<GameDataEngine['itemDisplay']>>>; inventoryType: number; subclassId: number; slot: AppearanceSlot | undefined }>, look?: CharacterModelLook): Promise<{ model: DressedModel; unavailable: AppearanceSlot[] } | null> {
    const [chrModels, displays, creatureModels, layouts, sections, materials, textureRows, componentTextures] = await Promise.all(['ChrModel', 'CreatureDisplayInfo', 'CreatureModelData', 'CharComponentTextureLayouts', 'CharComponentTextureSections', 'ItemDisplayInfoMaterialRes', 'TextureFileData', 'ComponentTextureFileData'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const bodyIndex = look?.sex === 'female' ? 1 : 0
    const raceModels = look?.raceId && look.sex ? await this.traitTable('ChrRaceXChrModel') : null
    const match = raceModels && [...raceModels.values()].find(row => num(row.ChrRacesID) === look?.raceId && num(row.Sex) === bodyIndex)
    const modelId = num(match && match.ChrModelID) || 1
    const chr = chrModels.get(modelId)
    const bodyFile = num(creatureModels.get(num(displays.get(num(chr?.DisplayID))?.ModelID))?.FileDataID)
    const layoutId = num(chr?.CharComponentTextureLayoutID)
    const layout = layouts.get(layoutId)
    if (!bodyFile || !layout) return null
    const capePiece = pieces.find(piece => piece.inventoryType === 16)?.found
    const cape = capePiece?.textureFile(capePiece.materials[0] ?? 0) ?? null
    const skinTexture = (material: number) => {
      const candidates = [...textureRows.values()].filter(row => num(row.MaterialResourcesID) === material)
      const variant = candidates.find(row => {
        const component = componentTextures.get(num(row.FileDataID))
        return component && num(component.RaceID) === (match ? look?.raceId : 1) && num(component.GenderIndex) === (match ? bodyIndex : 0)
      })
      return num((variant ?? candidates[0])?.FileDataID) || null
    }
    const synced = match && look?.customization.length ? await this.readSyncedLook(modelId, layoutId, look, skinTexture) : null
    const looks = synced?.skin.length ? { skin: synced.skin, hair: synced.textures.get(6) ?? null, hairGeoset: null } : await this.defaultLook(modelId, layoutId, skinTexture)
    const conditional = synced?.conditionalModel ? (await this.traitTable('ChrCustomizationCondModel').catch(() => null))?.get(synced.conditionalModel) : undefined
    // A helmet covers the hair
    const hairGeoset = pieces.some(piece => piece.inventoryType === 1) ? null : looks.hairGeoset
    const weapons = pieces.flatMap(({ inventoryType, subclassId, slot }) => weaponAnimations(inventoryType, subclassId, slot))
    const animations = [...new Set([0, 4, 5, ...(weapons.length ? weapons : [25, 60, 69, 53, 113])])]
    const helmet = pieces.some(piece => piece.inventoryType === 1)
    const body = await this.modelPart(num(conditional?.FileDataID) || bodyFile, (type, txid) => type === 0 ? txid || null : type === 2 ? cape : type === 6 ? looks.hair : synced?.textures.get(type) ?? null, {
      geosets: available => {
        const selectedGroups = new Set([...synced?.pickedGeosets ?? []].map(id => Math.floor(id / 100)).filter(Boolean))
        const base = bareGeosets.filter(id => available.has(id) && !synced?.replaceGeosets.has(id) && !selectedGroups.has(Math.floor(id / 100)))
        for (const group of [7, 22, 32]) {
          if (selectedGroups.has(group) || base.some(id => Math.floor(id / 100) === group)) continue
          const id = [...available].find(id => Math.floor(id / 100) === group && !synced?.replaceGeosets.has(id))
          if (id != null) base.push(id)
        }
        for (const id of synced?.pickedGeosets ?? []) if (available.has(id) && (!helmet || Math.floor(id / 100) !== 0)) base.push(id)
        if (hairGeoset != null && available.has(hairGeoset)) base.push(hairGeoset)
        return new Set(outfitGeosets(pieces.map(({ inventoryType, found }) => ({ inventoryType, geosetGroup: found.geosetGroup })), available, base))
      },
      animations,
    })
    if (!body) return null
    const attached: DressedModel['attached'] = []
    const textures: DressedModel['textures'] = []
    const unavailable: AppearanceSlot[] = []
    for (const { found, inventoryType, slot } of pieces) {
      const points = wornAttachments(inventoryType, slot)
      const layers = [...materials.values()].filter(row => num(row.ItemDisplayInfoID) === num(found.display.ID))
        .flatMap(row => {
          const file = found.textureFile(num(row.MaterialResourcesID))
          return file ? [{ section: num(row.ComponentSection), fileDataId: file }] : []
        })
      textures.push(...layers)
      let shown = layers.length > 0 || (inventoryType === 16 && cape !== null)
      let omitted = false
      for (const [index, resource] of found.resources.entries()) {
        if (!resource || (slot === 'shoulderLeft' && index !== 0) || (slot === 'shoulderRight' && index !== 1)) continue
        const file = found.modelFile(resource, index)
        const attachment = points[index]
        if (!file || attachment == null || !body.attachments.some(point => point.id === attachment)) {
          // Collection meshes require retargeting. Cloaks are already painted on the body.
          if (inventoryType !== 16) omitted = true
          continue
        }
        const part = await this.modelPart(file, (type, txid) => type === 0 ? txid || null : found.slotTexture(index, type), { particleColor: found.particleColor }).catch(() => null)
        if (part) { attached.push({ part, attachment }); shown = true }
        else omitted = true
      }
      if (slot && (!shown || omitted)) unavailable.push(slot)
    }
    return {
      unavailable,
      model: {
        appearance: synced?.skin.length ? 'synced' : match ? 'default' : 'stand-in',
        body, textures, cape, attached, skin: looks.skin, hair: looks.hair,
        layout: { width: num(layout.Width), height: num(layout.Height), sections: [...sections.values()].filter(row => num(row.CharComponentTextureLayoutID) === layoutId).map(row => ({ section: num(row.SectionType), x: num(row.X), y: num(row.Y), width: num(row.Width), height: num(row.Height) })) },
      },
    }
  }

  private async readSyncedLook(modelId: number, layout: number, look: CharacterModelLook, textureFile: (material: number) => number | null) {
    const [options, choices, elements, materials, layers, geosets] = await Promise.all(['ChrCustomizationOption', 'ChrCustomizationChoice', 'ChrCustomizationElement', 'ChrCustomizationMaterial', 'ChrModelTextureLayer', 'ChrCustomizationGeoset'].map(table => this.traitTable(table)))
    return syncedCharacterLook(modelId, layout, look.customization, { options, choices, elements, materials, layers, geosets }, textureFile)
  }

  /**
   * A character model's first look in the character creator: its skin and face textures with the body sections each
   * covers, and its first hairstyle with hair, with that hair's texture. Choices are found by their names in the game's data, so a
   * look the build doesn't name this way is left plain
   */
  private async defaultLook(chrModelId: number, layoutId: number, textureFile: (material: number) => number | null) {
    const [options, choices, elements, materials, layers, geosets] = await Promise.all(['ChrCustomizationOption', 'ChrCustomizationChoice', 'ChrCustomizationElement', 'ChrCustomizationMaterial', 'ChrModelTextureLayer', 'ChrCustomizationGeoset'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const choicesOf = (name: string) => {
      const option = [...options.values()].find(row => num(row.ChrModelID) === chrModelId && String(row.Name_lang ?? '').toLocaleLowerCase() === name)
      return option ? [...choices.values()].filter(row => num(row.ChrCustomizationOptionID) === num(option.ID)).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex)) : []
    }
    const first = (name: string) => choicesOf(name)[0] ?? null
    const skinChoice = first('skin color')
    // Some faces and hair colours come in a version per skin colour
    const elementsOf = (choice: Row | null) => choice ? [...elements.values()].filter(row => num(row.ChrCustomizationChoiceID) === num(choice.ID) && (!num(row.RelatedChrCustomizationChoiceID) || num(row.RelatedChrCustomizationChoiceID) === num(skinChoice?.ID))) : []
    const layerOf = (material: Row) => [...layers.values()].find(row => num(row.CharComponentTextureLayoutsID) === layoutId && (Array.isArray(row.ChrModelTextureTargetID) ? row.ChrModelTextureTargetID : [row.ChrModelTextureTargetID]).map(Number).includes(num(material.ChrModelTextureTargetID)))
    const skin: Array<{ section: number | null; fileDataId: number; layer: number }> = []
    let hair: number | null = null
    for (const element of [...elementsOf(skinChoice), ...elementsOf(first('face')), ...elementsOf(first('hair color'))]) {
      const material = materials.get(num(element.ChrCustomizationMaterialID))
      const layer = material ? layerOf(material) : undefined
      const file = material ? textureFile(num(material.MaterialResourcesID)) : null
      if (!layer || !file) continue
      if (num(layer.TextureType) === 6) { hair ??= file; continue }
      if (num(layer.TextureType) !== 1) continue
      const mask = num(layer.TextureSectionTypeBitMask)
      const sections = mask === -1 ? [null] : Array.from({ length: 31 }, (_, bit) => bit).filter(bit => mask & (1 << bit))
      for (const section of sections) skin.push({ section, fileDataId: file, layer: num(layer.Layer) })
    }
    // The first hairstyle is often bald, so the first one with hair is used
    const hairStyle = choicesOf('hair style').map(choice => elementsOf(choice).map(row => geosets.get(num(row.ChrCustomizationGeosetID))).find(row => row && num(row.GeosetID) > 0)).find(Boolean)
    return {
      skin: skin.sort((a, b) => a.layer - b.layer).map(({ section, fileDataId }) => ({ section, fileDataId })),
      hair,
      hairGeoset: hairStyle ? num(hairStyle.GeosetType) * 100 + num(hairStyle.GeosetID) : null,
    }
  }

  /**
   * A creature's model from its display, such as a mount or a battle pet, with the display's skins. Pieces in the same
   * group are alternatives, so only the first of each group shows unless the display picks one
   */
  creatureModel(displayId: number): Promise<CreatureModel | null> {
    if (!Number.isInteger(displayId) || displayId <= 0) return Promise.reject(new Error('Invalid creature'))
    return this.remember(`creature:${displayId}`, async () => {
      const [displays, creatureModels, geosetData] = await Promise.all(['CreatureDisplayInfo', 'CreatureModelData', 'CreatureDisplayInfoGeosetData'].map(table => this.traitTable(table)))
      const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
      const display = displays.get(displayId)
      const file = num(creatureModels.get(num(display?.ModelID))?.FileDataID)
      if (!display || !file) return null
      const skins = (Array.isArray(display.TextureVariationFileDataID) ? display.TextureVariationFileDataID : [display.TextureVariationFileDataID]).map(entry => Number(entry) || 0)
      const picked = new Map<number, number>()
      for (const row of geosetData.values()) if (num(row.CreatureDisplayInfoID) === displayId) picked.set(num(row.GeosetIndex) + 1, num(row.GeosetValue))
      const part = await this.modelPart(file, (type, txid) => type === 0 ? txid || null : type >= 11 && type <= 13 ? skins[type - 11] || null : null, {
        particleColor: num(display.ParticleColorID),
        geosets: available => {
          const keep = new Set<number>()
          const groups = new Map<number, number[]>()
          for (const id of available) groups.set(Math.floor(id / 100), [...(groups.get(Math.floor(id / 100)) ?? []), id])
          for (const [group, ids] of groups) {
            const value = picked.get(group)
            if (group === 0) { ids.forEach(id => keep.add(id)); continue }
            keep.add(value != null && ids.includes(group * 100 + value) ? group * 100 + value : Math.min(...ids))
          }
          return keep
        },
      })
      return part ? { displayId, parts: [part] } : null
    })
  }

  private looksBuild: Promise<void> | null = null
  private looksProgress = { ready: false, done: 0, total: 0 }
  /** Each icon's colours, read from its pixels once per game build and kept on disk */
  private iconColors = new Map<number, LookColor[]>()

  /**
   * How far the looks index is: the colours of every item, mount, and pet icon, which items have particle effects, and
   * their theme tags. The first call starts building it in the background; later calls report its progress
   */
  looksStatus() {
    if (!this.looksBuild) {
      this.looksBuild = this.buildLooks()
      this.looksBuild.catch(() => { this.looksBuild = null })
    }
    return { ...this.looksProgress }
  }

  private async buildLooks() {
    const db = this.ready()
    const casc = await this.openCasc()
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const file = path.join(this.directory, `looks-${this.status.indexedVersion ?? 'unknown'}.json`)
    try { const saved = JSON.parse(await readFile(file, 'utf8')) as { icons: Record<string, LookColor[]> }; for (const [id, colors] of Object.entries(saved.icons)) this.iconColors.set(Number(id), colors) } catch { /* first build */ }
    const save = () => writeFile(file, JSON.stringify({ icons: Object.fromEntries(this.iconColors) }))
    const items = db.prepare(`SELECT id, name, icon FROM items WHERE inventory_type IN (${EQUIPPABLE})`).all() as Array<{ id: number; name: string; icon: number | null }>
    const creatures = [...await this.mounts('', null, 100000), ...await this.pets('', null, 100000)]
    const icons = [...new Set([...items, ...creatures].map(entry => entry.icon).filter((icon): icon is number => !!icon && !this.iconColors.has(icon)))]
    this.looksProgress = { ready: false, done: 0, total: icons.length }
    for (const [i, icon] of icons.entries()) {
      try { const picture = decodeBlp(await casc.file(icon)); this.iconColors.set(icon, paletteOf(picture.pixels, picture.width, picture.height)) } catch { this.iconColors.set(icon, []) }
      this.looksProgress.done = i + 1
      // Let model reads in between, and keep what is done if the app closes
      if (i % 200 === 199) await new Promise(resolve => setImmediate(resolve))
      if (i % 4000 === 3999) await save()
    }
    if (icons.length) await save()
    // An item's look comes from its base appearance's display: particle colours mean an effect
    const [modified, appearances, displays] = await Promise.all(['ItemModifiedAppearance', 'ItemAppearance', 'ItemDisplayInfo'].map(table => this.traitTable(table)))
    const base = new Map<number, Row>()
    for (const row of modified.values()) { const item = num(row.ItemID); const found = base.get(item); if (!found || num(row.OrderIndex) < num(found.OrderIndex)) base.set(item, row) }
    const effectColors = new Map<number, LookColor[]>()
    const colorsOf = async (id: number) => {
      if (!effectColors.has(id)) effectColors.set(id, [...new Set((await this.particleColors(id)).flat().filter(rgb => rgb.some(value => value > 24)).map(rgb => colorName(rgb[0]!, rgb[1]!, rgb[2]!)))])
      return effectColors.get(id)!
    }
    db.exec('DROP TABLE IF EXISTS temp.looks; CREATE TEMP TABLE looks (item_id INTEGER PRIMARY KEY, effect INTEGER NOT NULL, tags TEXT NOT NULL)')
    const insert = db.prepare('INSERT INTO temp.looks VALUES (?, ?, ?)')
    const rows: Array<[number, number, string]> = []
    for (const item of items) {
      const display = displays.get(num(appearances.get(num(base.get(item.id)?.ItemAppearanceID))?.ItemDisplayInfoID))
      const particle = num(display?.ParticleColorID)
      const effect = particle > 0 || num(display?.ItemVisual) > 0
      const glow = particle ? await colorsOf(particle) : []
      const colors = [...(item.icon ? this.iconColors.get(item.icon) ?? [] : []), ...glow]
      rows.push([item.id, effect ? 1 : 0, tagString([...colors, ...themeTags(item.name, glow), ...(effect ? ['effect'] : [])])])
    }
    db.transaction(() => { for (const row of rows) insert.run(...row) })()
    this.looksProgress = { ready: true, done: icons.length, total: icons.length }
  }

  /** A filter for creatures by their looks: the icon's colours, theme words in the name, and a particle effect on the display */
  private async creatureLooks(look: LookFilter) {
    if (!look.tags?.length && (!look.effect || look.effect === 'any')) return () => true
    const displays = await this.traitTable('CreatureDisplayInfo')
    return (name: string, icon: number | null, displayId: number) => {
      const effect = Number(displays.get(displayId)?.ParticleColorID) > 0
      if (look.effect === 'with' && !effect) return false
      if (look.effect === 'without' && effect) return false
      const tags = new Set([...(icon ? this.iconColors.get(icon) ?? [] : []), ...themeTags(name), ...(effect ? ['effect'] : [])])
      return (look.tags ?? []).every(tag => tags.has(tag))
    }
  }

  /** Test and placeholder entries the game keeps, such as "[PH] Horse with Hat" or "[DNT] Storm Pet Fodder" */
  private static placeholder = /^\s*[[(]\s*(ph|dnd|dnt|nyi|test|tbd)\b/i

  /**
   * Mounts whose name matches, optionally from one source (0 drop, 1 quest, 2 vendor, and so on), with each one's
   * creature display, source, and the icon of the spell that summons it
   */
  async mounts(text: string, source: number | null = null, limit = 300, look: LookFilter = {}): Promise<Array<{ id: number; name: string; icon: number | null; displayId: number; source: number }>> {
    const [mounts, displays, spells] = await Promise.all(['Mount', 'MountXDisplay', 'SpellMisc'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const wanted = text.trim().toLocaleLowerCase()
    const shown = new Map<number, number>()
    for (const row of displays.values()) if (!shown.has(num(row.MountID))) shown.set(num(row.MountID), num(row.CreatureDisplayInfoID))
    const icons = new Map<number, number>()
    for (const row of spells.values()) if (num(row.SpellIconFileDataID) && !icons.has(num(row.SpellID))) icons.set(num(row.SpellID), num(row.SpellIconFileDataID))
    const matches = await this.creatureLooks(look)
    return [...mounts.values()].filter(row => String(row.Name_lang ?? '').toLocaleLowerCase().includes(wanted) && !GameDataEngine.placeholder.test(String(row.Name_lang ?? '')) && shown.get(num(row.ID)) && (source == null || num(row.SourceTypeEnum) === source) && matches(String(row.Name_lang), icons.get(num(row.SourceSpellID)) ?? null, shown.get(num(row.ID))!))
      .sort((a, b) => String(a.Name_lang).localeCompare(String(b.Name_lang))).slice(0, limit)
      .map(row => ({ id: num(row.ID), name: String(row.Name_lang), icon: icons.get(num(row.SourceSpellID)) ?? null, displayId: shown.get(num(row.ID))!, source: num(row.SourceTypeEnum) }))
  }

  /** Battle pets whose name matches, optionally of one family (0 humanoid through 9 mechanical), with each one's display, family, and icon */
  async pets(text: string, family: number | null = null, limit = 300, look: LookFilter = {}): Promise<Array<{ id: number; name: string; icon: number | null; displayId: number; family: number }>> {
    const [species, creatures] = await Promise.all(['BattlePetSpecies', 'Creature'].map(table => this.traitTable(table)))
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const wanted = text.trim().toLocaleLowerCase()
    const matches = await this.creatureLooks(look)
    return [...species.values()].flatMap(row => {
      const creature = creatures.get(num(row.CreatureID))
      const name = String(creature?.Name_lang ?? '')
      const displayId = num(creature?.DisplayID)
      return name && displayId && name.toLocaleLowerCase().includes(wanted) && !GameDataEngine.placeholder.test(name) && (family == null || num(row.PetTypeEnum) === family) && matches(name, num(row.IconFileDataID) || null, displayId) ? [{ id: num(row.ID), name, icon: num(row.IconFileDataID) || null, displayId, family: num(row.PetTypeEnum) }] : []
    }).sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
  }

  /** Each boss's loot from the journal, as the summaries a compatibility check reads; needs the item index */
  async encounterLoot(encounterIds: number[]): Promise<Record<number, LootItem[]>> {
    const rows = await this.traitTable('JournalEncounterItem')
    const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
    const wanted = new Set(encounterIds)
    const byBoss = new Map<number, number[]>()
    for (const row of rows.values()) { const boss = num(row.JournalEncounterID); if (wanted.has(boss)) byBoss.set(boss, [...(byBoss.get(boss) ?? []), num(row.ItemID)]) }
    const out: Record<number, LootItem[]> = {}
    for (const [boss, ids] of byBoss) {
      const items = new Map(this.items(ids).map(item => [item.id, item]))
      // Journal order is the order the game shows the loot in
      out[boss] = ids.map(id => items.get(id)).filter(item => !!item).map(item => ({
        id: item.id, name: item.name, quality: item.quality, slot: item.slot, inventoryType: item.inventoryType, armor: item.armor, icon: item.icon,
        requiredLevel: item.requiredLevel, classId: item.classId, subclassId: item.subclassId, allowableClassMask: item.allowableClassMask, specIds: item.specIds, primaryStats: item.primaryStats,
      }))
    }
    return out
  }

  /** Names, text, and icons for the spells trash enemies cast, read from the game files */
  async dungeonSpells(ids: number[]): Promise<Record<number, EnemySpell>> {
    const { map, iconOf, fill } = await this.journalSpells(new Set(ids))
    const out: Record<number, EnemySpell> = {}
    for (const id of ids) {
      const spell = map.get(id)
      if (spell?.name) out[id] = { id, name: spell.name, text: fill(spell.description, id), icon: iconOf.get(id) ?? null }
    }
    return out
  }

  async catalystSources(itemId: number): Promise<CatalystSource[]> {
    const db = this.ready()
    const tier = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined
    if (!tier || this.indexVersion !== INDEX_VERSION) return []
    const made = await this.catalystItems().catch(() => new Set<number>())
    if (made.size ? !made.has(itemId) : !tier.item_set) return []
    const slots = [5, 20].includes(tier.inventory_type) ? [5, 20] : [tier.inventory_type]
    // Other classes' off-pieces carry no set id either, so the Catalyst's own list leaves them out
    const rows = (db.prepare(`SELECT id, name, quality, icon FROM items WHERE class_id = ? AND subclass_id = ? AND inventory_type IN (${slots.join(',')}) AND item_set IS NULL AND quality >= 3 AND latest_track = 1 AND crafted = 0 ORDER BY name`).all(tier.class_id, tier.subclass_id) as Array<{ id: number; name: string; quality: number; icon: number | null }>)
      .filter(row => !made.has(row.id))
    const listsOf = await this.dropBonusLists()
    const result: CatalystSource[] = []
    for (const row of rows) {
      const lists = listsOf(row.id)
      const info = lists.length ? await this.bonusInfo(lists) : {}
      const variants = Object.entries(info).flatMap(([id, entry]) => entry.variant ? [{ bonusId: Number(id), ...entry.variant }] : [])
      const stats = (this.itemPower(row.id, tier.item_level)?.stats ?? []).filter(stat => stat.secondary).map(stat => stat.name)
      result.push({ itemId: row.id, name: row.name, quality: row.quality, icon: row.icon, stats, variants })
    }
    return result.sort((a, b) => (Number(!a.variants.length) - Number(!b.variants.length)) || a.name.localeCompare(b.name))
  }

  /** Bonus lists' variants and upgrade tracks, read once from the game's ItemBonus table */
  private bonusRows: Promise<Map<number, Row[]>> | null = null
  async bonusInfo(ids: number[]): Promise<Record<number, BonusInfo>> {
    const wanted = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 400)
    if (!wanted.length) return {}
    this.bonusRows ??= this.traitTable('ItemBonus').then(rows => {
      const byList = new Map<number, Row[]>()
      for (const row of rows.values()) { const list = Number(row.ParentItemBonusListID); byList.set(list, [...(byList.get(list) ?? []), row]) }
      return byList
    })
    this.bonusRows.catch(() => { this.bonusRows = null })
    const byList = await this.bonusRows
    const first = (value: unknown) => Number(Array.isArray(value) ? value[0] : value)
    const lists = wanted.map(id => [id, byList.get(id) ?? []] as const)
    const effectIds = lists.flatMap(([, rows]) => rows.filter(row => Number(row.Type) === 23).map(row => first(row.Value)))
    const [effects, descriptions, misc] = effectIds.length ? await Promise.all([this.traitTable('ItemEffect'), this.traitTable('ItemNameDescription'), this.traitTable('SpellMisc')]) : [null, null, null]
    const spellOf = (effect: number) => Number(effects?.get(effect)?.SpellID ?? 0)
    const spells = effectIds.length ? await talentSpells(name => this.traitTable(name), effectIds.map(spellOf).filter(Boolean)) : {}
    const map = new Map(Object.entries(spells).map(([id, spell]) => [Number(id), spell]))
    const noItem: ItemStatBlock = { statTypes: [], alloc: [], socketShare: [], inventoryType: 0, classId: 0, subclassId: 0, quality: 4 }
    const noLevel: ScalingLevel = { itemLevel: 0, epic: [], superior: [], good: [], damageReplace: 0, damageSecondary: 0, rating: null, stamina: null, armorTotal: null, armorQuality: null, shield: null, socketCost: null }
    // Embellishments add effects too, but they're shown as embellishments, not variants
    const embellished = new Set<number>()
    if (this.indexVersion === INDEX_VERSION) for (const row of this.ready().prepare('SELECT bonus_lists FROM embellishments').all() as Array<{ bonus_lists: string | null }>) { try { for (const list of JSON.parse(row.bonus_lists ?? '[]') as number[]) embellished.add(list) } catch { /* unreadable row */ } }
    const result: Record<number, BonusInfo> = {}
    for (const [id, rows] of lists) {
      const named = rows.find(row => Number(row.Type) === 4)
      const effect = rows.find(row => Number(row.Type) === 23)
      const track = rows.find(row => Number(row.Type) === 34)
      const name = named ? String(descriptions?.get(first(named.Value))?.Description_lang ?? '') : ''
      const spell = effect ? spellOf(first(effect.Value)) : 0
      let icon: number | null = null
      if (spell) for (const row of misc?.values() ?? []) if (Number(row.SpellID) === spell && !Number(row.DifficultyID)) { icon = Number(row.SpellIconFileDataID) || null; break }
      // Values scale with the item, which the files can't say here, so unknown amounts are left out of the wording
      const text = spell ? cleanGameText(effectText(spell, map, noItem, noLevel).text).replace(/ by \?%?/g, '').replace(/\?%? ?/g, '').replace(/\s+/g, ' ').trim() : ''
      // A variant without a name of its own, such as one that adds Void Eruption, goes by its effect's name
      const label = name || (spell ? String(map.get(spell)?.name ?? '') : '')
      result[id] = { variant: spell && label && !embellished.has(id) ? { name: label, effect: text, icon } : null, trackGroup: track ? first(track.Value) : null }
    }
    return result
  }

  appearanceOptions(input: ItemSearch): { items: AppearanceOption[]; nextOffset: number | null } {
    const { items, nextOffset } = this.searchPage({ ...input, limit: 48 })
    if (!items.length) return { items: [], nextOffset }
    const rows = this.ready().prepare(`SELECT modified_id, item_id, appearance_id, icon FROM appearances WHERE item_id IN (${items.map(() => '?').join(',')}) ORDER BY modifier`).all(...items.map(item => item.id)) as Array<{ modified_id: number; item_id: number; appearance_id: number; icon: number | null }>
    const byItem = new Map(items.map(item => [item.id, item]))
    const seen = new Set<number>()
    const options = rows.flatMap(row => {
      if (seen.has(row.appearance_id)) return []
      seen.add(row.appearance_id)
      const item = byItem.get(row.item_id)!
      return [{ appearanceId: row.appearance_id, modifiedAppearanceId: row.modified_id, itemId: row.item_id, itemName: item.name, quality: item.quality, icon: row.icon ?? item.icon }]
    })
    return { items: options, nextOffset }
  }

  /** Reads game tables for talents once per open session; they're large and every specialization shares them */
  private traitTables = new Map<string, Promise<Map<number, Row>>>()
  private traitTable(name: string) {
    let pending = this.traitTables.get(name)
    if (!pending) { pending = this.openCasc().then(casc => this.table(casc, name)); this.traitTables.set(name, pending); pending.catch(() => this.traitTables.delete(name)) }
    return pending
  }
  /** A specialization's talent tree, built from the installed game and kept on disk per game version */
  async talentTree(specId: number): Promise<TalentTree | null> {
    if (!this.install) throw new Error('World of Warcraft was not found on this computer')
    const version = this.install.build.version
    const file = path.join(this.directory, 'talents', `${version}-${specId}-v2.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) as TalentTree } catch { /* build below */ }
    const tree = await buildTalentTree(name => this.traitTable(name), specId, version)
    if (tree) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(tree)) }
    return tree
  }
  /** Every specialization with its class and icon */
  async specializations() {
    if (!this.install) return []
    const file = path.join(this.directory, 'talents', `${this.install.build.version}-specs.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) as Awaited<ReturnType<typeof specializationRows>> } catch { /* build below */ }
    const rows = await specializationRows(name => this.traitTable(name))
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(rows))
    return rows
  }

  enchantNames(ids: number[]): Record<number, string> {
    const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 200)
    if (!unique.length) return {}
    const rows = this.ready().prepare(`SELECT id, name FROM enchants WHERE id IN (${unique.map(() => '?').join(',')})`).all(...unique) as Array<{ id: number; name: string }>
    return Object.fromEntries(rows.map(row => [row.id, row.name]))
  }

  /**
   * This season's embellishments with their effect worked out for the planned item at its level. Values the game
   * files can't answer leave the effect marked incomplete
   */
  embellishments(itemId: number | null, itemLevel: number | null): EmbellishmentOption[] {
    const db = this.ready()
    if (this.indexVersion !== INDEX_VERSION) return []
    const rows = db.prepare('SELECT * FROM embellishments ORDER BY name').all() as Array<{ item_id: number; name: string; quality: number; icon: number | null; description: string; applies: string | null; limit_name: string; bonus_lists?: string }>
    const item = itemId ? db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined : undefined
    const scalingRow = itemLevel ? db.prepare('SELECT data FROM scaling WHERE item_level = ?').get(Math.round(itemLevel)) as { data: string } | undefined : undefined
    const level = scalingRow ? JSON.parse(scalingRow.data) as ScalingLevel : null
    const parsed = item?.stats ? JSON.parse(item.stats) as { t: number[]; a: number[]; s: number[] } : { t: [], a: [], s: [] }
    const block: ItemStatBlock = { statTypes: parsed.t, alloc: parsed.a, socketShare: parsed.s, inventoryType: item?.inventory_type ?? 0, classId: item?.class_id ?? 0, subclassId: item?.subclass_id ?? 0, quality: Math.max(item?.quality ?? 4, 4) }
    const spells = new Map<number, SpellData>()
    const load = (spellId: number, depth: number) => {
      if (spells.has(spellId) || depth > 2) return
      const found = db.prepare('SELECT data FROM spells WHERE id = ?').get(spellId) as { data: string } | undefined
      if (!found) return
      const spell = JSON.parse(found.data) as SpellData
      spells.set(spellId, spell)
      for (const match of spell.description.matchAll(/\$(?:@spelldesc)?(\d{3,})/g)) load(Number(match[1]), depth + 1)
    }
    return rows.map(row => {
      for (const match of row.description.matchAll(/\$@spelldesc(\d+)/g)) load(Number(match[1]), 0)
      // The reagent's own text is read like a spell description so its tokens fill in the same way
      spells.set(-1, { id: -1, name: row.name, description: row.description, durationMs: null, maxStacks: null, effects: [] })
      const effect = level ? effectText(-1, spells, block, level) : { text: row.description.replace(/\$@spelldesc\d+/g, ''), complete: false }
      return { itemId: row.item_id, name: row.name, quality: row.quality, icon: row.icon, applies: row.applies, limit: row.limit_name, bonusLists: (() => { try { return JSON.parse(row.bonus_lists ?? '[]') as number[] } catch { return [] } })(), effect: cleanGameText(effect.text).replace(/Unique-Equipped:[^.]*\.?/gi, ' ').replace(/\.(?=[A-Z])/g, '. ').replace(/\s+/g, ' ').trim(), complete: effect.complete }
    })
  }

  /**
   * The game identifiers SimulationCraft needs for a plan's enhancements, which plans store by name: an enchant becomes
   * its SpellItemEnchantment ID (enchant scrolls name it in CraftingDataEnchantQuality, highest rank first), a gem its
   * item ID, and an embellishment reagent the bonus lists it puts on the item. Anything unknown comes back empty
   */
  async enhancementIds(requests: Array<{ slot: AppearanceSlot; enchant: string | null; gems: string[]; embellishment: number | null; enchantItem?: number }>): Promise<Array<{ enchantId: number | null; gemIds: number[]; bonusIds: number[] }>> {
    const db = this.ready()
    const ranks = await this.traitTable('CraftingDataEnchantQuality').catch(() => null)
    const enchantOf = new Map<number, number>()
    for (const row of ranks?.values() ?? []) enchantOf.set(Number(row.ItemID), Number(row.SpellItemEnchantmentID))
    const gems = new Map(this.enhancements('gem', null).map(option => [option.name.toLowerCase(), option.itemId]))
    const slotEnchants = new Map<AppearanceSlot, EnhancementOption[]>()
    const strip = (name: string) => name.replace(/^(Enchant|Enchanting)\s[^-]+-\s*/i, '').trim().toLowerCase()
    // Armor kits and spellthreads aren't enchant scrolls, so CraftingDataEnchantQuality skips them; their use spell
    // enchants the item instead (SpellEffect 53, the enchant ID in its first misc value). Read only when one is asked for
    let spellEnchant: ((itemId: number) => number | null) | null = null
    const viaSpell = async (itemId: number) => {
      if (!spellEnchant) {
        const [links, effects, spellEffects] = await Promise.all([this.traitTable('ItemXItemEffect'), this.traitTable('ItemEffect'), this.traitTable('SpellEffect')])
        const enchantBySpell = new Map<number, number>()
        for (const row of spellEffects.values()) {
          const misc = row.EffectMiscValue
          const id = Number(Array.isArray(misc) ? misc[0] : misc)
          if (Number(row.Effect) === 53 && id > 0 && !Number(row.DifficultyID)) enchantBySpell.set(Number(row.SpellID), id)
        }
        const byItem = new Map<number, number>()
        for (const link of links.values()) { const enchant = enchantBySpell.get(Number(effects.get(Number(link.ItemEffectID))?.SpellID)); if (enchant) byItem.set(Number(link.ItemID), enchant) }
        spellEnchant = id => byItem.get(id) ?? null
      }
      return spellEnchant(itemId)
    }
    return Promise.all(requests.slice(0, 40).map(async request => {
      let enchantId: number | null = null
      const enchant = request.enchant?.trim()
      // A scroll or kit named by its item, as top player data does
      if (request.enchantItem) enchantId = enchantOf.get(request.enchantItem) ?? await viaSpell(request.enchantItem).catch(() => null)
      else if (enchant) {
        const numbered = enchant.match(/^Enchant #(\d+)$/)
        if (numbered) enchantId = Number(numbered[1])
        else {
          const options = slotEnchants.get(request.slot) ?? this.enhancements('enchant', request.slot)
          slotEnchants.set(request.slot, options)
          const option = options.find(entry => entry.name.toLowerCase() === strip(enchant))
          enchantId = option ? enchantOf.get(option.itemId) ?? await viaSpell(option.itemId).catch(() => null) : null
          // A runeforge by name is this expansion's copy, not an older enchant of the same name
          if (!enchantId) enchantId = (db.prepare(`SELECT id FROM enchants WHERE lower(name) = ? AND id IN (${runeforgeIds.join(',')})`).get(strip(enchant)) as { id: number } | undefined)?.id ?? null
          if (!enchantId) enchantId = (db.prepare('SELECT id FROM enchants WHERE lower(name) = ? ORDER BY id DESC').get(strip(enchant)) as { id: number } | undefined)?.id ?? null
        }
      }
      const gemIds = request.gems.slice(0, 4).map(gem => { const numbered = gem.match(/^Gem #(\d+)$/); return numbered ? Number(numbered[1]) : gems.get(gem.trim().toLowerCase()) ?? 0 })
      let bonusIds: number[] = []
      if (request.embellishment) { try { bonusIds = JSON.parse((db.prepare('SELECT bonus_lists FROM embellishments WHERE item_id = ?').get(request.embellishment) as { bonus_lists: string } | undefined)?.bonus_lists ?? '[]') } catch { bonusIds = [] } }
      return { enchantId, gemIds, bonusIds }
    }))
  }

  /** Decodes an icon once and keeps the PNG on disk */
  async icon(fileDataId: number): Promise<string> {
    if (!Number.isInteger(fileDataId) || fileDataId <= 0) throw new Error('Invalid icon')
    const file = path.join(this.directory, 'icons', `${fileDataId}.png`)
    try { await readFile(file); return file } catch { /* decode below */ }
    const casc = await this.openCasc()
    const png = encodePng(decodeBlp(await casc.file(fileDataId)))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, png)
    return file
  }

  async close() { await this.releaseCasc(); this.db?.close(); this.db = null }
}
