import Database from 'better-sqlite3'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { decodeBlp, encodePng } from './blp'
import { LocalCasc } from './casc'
import { Definitions } from './definitions'
import { detectInstall, readInstall, type WowInstall } from './install'
import { readHeader, readTable, type Row } from './wdc'
import { armorSlots, armorTypes, inventoryTypeNames, itemSearchSchema, slotInventoryTypes, type AppearanceOption, type EnhancementOption, type GameDataStatus, type ItemDetail, type ItemSearch, type ItemSource, type ItemSummary } from '../../shared/gamedata'
import type { AppearanceSlot } from '../../shared/domain'
import { getItemCompatibility } from '../../shared/item-compatibility'
import { compatibilityMetadata } from './item-metadata'

export const INDEX_VERSION = 2
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

const bondingNames: Record<number, string> = { 1: 'Binds when picked up', 2: 'Binds when equipped', 3: 'Binds when used', 4: 'Quest item', 7: 'Binds to Warband', 8: 'Binds to Warband until equipped', 9: 'Binds to Warband until equipped' }
/** Item enhancement subclasses by paper-doll slot, used to list enchants */
const enchantSubclasses: Partial<Record<AppearanceSlot, number[]>> = { head: [0], neck: [1], shoulder: [2], back: [3], chest: [4], wrist: [5], hands: [6], waist: [7], legs: [8], feet: [9], finger1: [10], finger2: [10], mainHand: [11, 12], offHand: [11, 13] }
const JUNK = `i.name != '' AND i.name NOT LIKE 'Monster -%' AND i.name NOT LIKE '%[PH]%' AND i.name NOT LIKE 'OLD%' AND i.name NOT LIKE 'Test %' AND i.name NOT LIKE '%Deprecated%' AND i.name NOT LIKE 'zz%' AND i.name NOT LIKE '%(old)%'`
const EQUIPPABLE = Object.keys(inventoryTypeNames).join(',')

type ItemRow = { id: number; name: string; quality: number; item_level: number; required_level: number; inventory_type: number; class_id: number; subclass_id: number; icon: number | null; expansion: number; bonding: number; sockets: number; description: string; allowable_class_mask?: number | null; spec_ids?: string | null; primary_stats?: string | null }

export type EngineEvents = { status(status: GameDataStatus): void }

export class GameDataEngine {
  private install: WowInstall | null = null
  private casc: Promise<LocalCasc> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private db: Database.Database | null = null
  private indexVersion: number | null = null
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
    this.db?.close(); this.db = null; this.indexVersion = null
    this.install = install
    if (!install) { this.publish({ state: 'no-install', install: null, indexedVersion: null, itemCount: 0, progress: null, error: null }); return }
    const file = this.indexPath(install.build.version)
    let opened: Database.Database | undefined
    try {
      const db = opened = new Database(file, { readonly: true, fileMustExist: true })
      const version = (db.prepare("SELECT value FROM meta WHERE key = 'index_version'").get() as { value: string } | undefined)?.value
      if (![1, INDEX_VERSION].includes(Number(version))) throw new Error('Index format changed')
      this.db = db
      this.indexVersion = Number(version)
      const count = (db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n
      this.publish({ state: this.indexVersion === INDEX_VERSION ? 'ready' : 'not-indexed', install: { root: install.root, version: install.build.version }, indexedVersion: install.build.version, itemCount: count, progress: null, error: null })
    } catch {
      opened?.close(); this.db = null; this.indexVersion = null
      this.publish({ state: 'not-indexed', install: { root: install.root, version: install.build.version }, indexedVersion: null, itemCount: 0, progress: null, error: null })
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
    const steps = ['Opening game data', 'Reading items', 'Reading item details', 'Reading appearances', 'Reading enchants', 'Reading dungeon and raid loot', 'Building search']
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
      const sparse = await this.table(casc, 'ItemSparse', ['Display_lang', 'Description_lang', 'OverallQualityID', 'ItemLevel', 'RequiredLevel', 'ExpansionID', 'Bonding', 'SocketType', 'AllowableClass', 'StatModifier_bonusStat'])
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
      await rm(temporary, { force: true })
      const db = buildingDb = new Database(temporary)
      db.pragma('journal_mode = OFF')
      db.pragma('synchronous = OFF')
      db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, quality INTEGER NOT NULL, item_level INTEGER NOT NULL, required_level INTEGER NOT NULL, inventory_type INTEGER NOT NULL, class_id INTEGER NOT NULL, subclass_id INTEGER NOT NULL, icon INTEGER, expansion INTEGER NOT NULL, bonding INTEGER NOT NULL, sockets INTEGER NOT NULL, description TEXT NOT NULL, allowable_class_mask INTEGER, spec_ids TEXT, primary_stats TEXT);
        CREATE TABLE appearances (modified_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, appearance_id INTEGER NOT NULL, modifier INTEGER NOT NULL, icon INTEGER);
        CREATE TABLE sources (item_id INTEGER NOT NULL, encounter TEXT NOT NULL, instance TEXT NOT NULL, kind TEXT NOT NULL, season INTEGER NOT NULL);
        CREATE TABLE enchants (id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon INTEGER);`)
      const insertItem = db.prepare('INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
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
          insertItem.run(id, cleanGameText(String(row.Display_lang ?? '')), row.OverallQualityID ?? 1, row.ItemLevel ?? 0, Math.max(0, Number(row.RequiredLevel ?? 0)), base?.InventoryType ?? 0, base?.ClassID ?? 0, base?.SubclassID ?? 0, icon, row.ExpansionID ?? 0, row.Bonding ?? 0, sockets, cleanGameText(String(row.Description_lang ?? '')), compatibility.allowableClassMask, compatibility.specIds===null?null:JSON.stringify(compatibility.specIds), compatibility.primaryStats===null?null:JSON.stringify(compatibility.primaryStats))
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
        CREATE VIRTUAL TABLE items_fts USING fts5 (name, content='items', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
        INSERT INTO items_fts (rowid, name) SELECT id, name FROM items;`)
      const meta = db.prepare('INSERT INTO meta VALUES (?,?)')
      meta.run('index_version', String(INDEX_VERSION))
      meta.run('game_version', install.build.version)
      meta.run('built_at', new Date().toISOString())
      db.close()
      buildingDb = undefined
      this.db?.close(); this.db = null
      await rename(temporary, target)
      await this.removeOldIndexes(target)
      await this.useInstall(install)
    } catch (error) {
      buildingDb?.close()
      await rm(temporary, { force: true }).catch(() => {})
      // Reopen the previous complete file if replacement failed after its handle was closed
      if (!this.db) await this.useInstall(install).catch(() => {})
      this.publish({ state: this.db ? 'ready' : 'error', progress: null, error: error instanceof Error ? error.message : 'Item data could not be prepared' })
      throw error
    }
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
    return { id: row.id, name: row.name, quality: row.quality, itemLevel: row.item_level, requiredLevel: row.required_level, slot: inventoryTypeNames[row.inventory_type] ?? 'Other', inventoryType: row.inventory_type, armor, icon: row.icon, expansion: row.expansion, sources: sources.get(row.id) ?? [], classId:row.class_id, subclassId:row.subclass_id, allowableClassMask:row.allowable_class_mask??null, specIds:row.spec_ids?JSON.parse(row.spec_ids):null, primaryStats:row.primary_stats?JSON.parse(row.primary_stats):null }
  }

  search(input: ItemSearch): ItemSummary[] {
    const query = itemSearchSchema.parse(input)
    const db = this.ready()
    const where = [JUNK]
    const params: unknown[] = []
    let join = ''
    const tokens = query.text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
    if (tokens.length) { join = 'JOIN items_fts f ON f.rowid = i.id AND items_fts MATCH ?'; params.push(tokens.map(token => `"${token.replace(/"/g, '')}"*`).join(' ')) }
    const types = query.slot ? [...slotInventoryTypes[query.slot]] : null
    if (types && query.slot === 'offHand' && query.character?.className.toLowerCase() === 'warrior' && query.character.specId === 72) types.push(17)
    where.push(`i.inventory_type IN (${types ? types.join(',') : EQUIPPABLE})`)
    if (query.armor && (!query.slot || armorSlots.has(query.slot))) { where.push(`(i.inventory_type NOT IN (1,3,5,6,7,8,9,10,20) OR (i.class_id = 4 AND i.subclass_id = ?))`); params.push(armorTypes.indexOf(query.armor) + 1) }
    if (query.source !== 'any') { where.push('EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND s.kind = ?)'); params.push(query.source) }
    if (query.currentOnly) where.push('EXISTS (SELECT 1 FROM sources s WHERE s.item_id = i.id AND (s.season = (SELECT MAX(season) FROM sources) OR i.expansion = (SELECT MAX(expansion) FROM items WHERE quality = 4 AND id IN (SELECT item_id FROM sources))))')
    const order = tokens.length ? 'ORDER BY bm25(items_fts), i.expansion DESC, i.item_level DESC, i.id' : 'ORDER BY i.expansion DESC, i.item_level DESC, i.quality DESC, i.id'
    const statement = db.prepare(`SELECT i.* FROM items i ${join} WHERE ${where.join(' AND ')} ${order} LIMIT ? OFFSET ?`)
    const seen = new Set<string>()
    const unique: ItemRow[] = []
    const pageSize = Math.max(100,query.limit*3)
    for (let offset=0; unique.length<query.limit; offset+=pageSize) {
      const rows = statement.all(...params,pageSize,offset) as ItemRow[]
      for (const row of rows) {
        if (!getItemCompatibility(this.summary(row,new Map()),query.character,{slot:query.slot}).compatible) continue
        const key = `${row.name}|${row.inventory_type}`
        if (seen.has(key)) continue
        seen.add(key);unique.push(row)
        if (unique.length === query.limit) break
      }
      if (rows.length<pageSize) break
    }
    const sources = this.sourcesFor(unique.map(row => row.id))
    return unique.map(row => this.summary(row, sources))
  }

  item(id: number): ItemDetail | null {
    const db = this.ready()
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
    if (!row) return null
    const sources = this.sourcesFor([id])
    const appearances = db.prepare('SELECT modified_id, appearance_id, modifier, icon FROM appearances WHERE item_id = ? ORDER BY modifier').all(id) as Array<{ modified_id: number; appearance_id: number; modifier: number; icon: number | null }>
    return { ...this.summary(row, sources), classId: row.class_id, subclassId: row.subclass_id, bonding: bondingNames[row.bonding] ?? null, sockets: row.sockets, description: row.description, appearances: appearances.map(a => ({ modifiedAppearanceId: a.modified_id, appearanceId: a.appearance_id, modifier: a.modifier, icon: a.icon })) }
  }

  items(ids: number[]): ItemSummary[] {
    const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 200)
    if (!unique.length) return []
    const rows = this.ready().prepare(`SELECT * FROM items WHERE id IN (${unique.map(() => '?').join(',')})`).all(...unique) as ItemRow[]
    const sources = this.sourcesFor(rows.map(row => row.id))
    return rows.map(row => this.summary(row, sources))
  }

  /** Current-expansion enchant scrolls for a slot, or gems; rank variants collapse to the best quality */
  enhancements(kind: 'enchant' | 'gem', slot: AppearanceSlot | null): EnhancementOption[] {
    const db = this.ready()
    const filter = kind === 'gem' ? 'class_id = 3' : `class_id = 8 AND subclass_id IN (${(slot && enchantSubclasses[slot]) ? enchantSubclasses[slot]!.join(',') : '-1'})`
    const latest = (db.prepare(`SELECT MAX(expansion) AS e FROM items i WHERE ${filter} AND ${JUNK}`).get() as { e: number | null }).e
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

  appearanceOptions(slot: AppearanceSlot, text: string, armor: (typeof armorTypes)[number] | null): AppearanceOption[] {
    const items = this.search({ text, slot, armor, limit: 60 })
    if (!items.length) return []
    const rows = this.ready().prepare(`SELECT modified_id, item_id, appearance_id, icon FROM appearances WHERE item_id IN (${items.map(() => '?').join(',')}) ORDER BY modifier`).all(...items.map(item => item.id)) as Array<{ modified_id: number; item_id: number; appearance_id: number; icon: number | null }>
    const byItem = new Map(items.map(item => [item.id, item]))
    const seen = new Set<number>()
    return rows.flatMap(row => {
      if (seen.has(row.appearance_id)) return []
      seen.add(row.appearance_id)
      const item = byItem.get(row.item_id)!
      return [{ appearanceId: row.appearance_id, modifiedAppearanceId: row.modified_id, itemId: row.item_id, itemName: item.name, quality: item.quality, icon: row.icon ?? item.icon }]
    })
  }

  enchantNames(ids: number[]): Record<number, string> {
    const unique = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 200)
    if (!unique.length) return {}
    const rows = this.ready().prepare(`SELECT id, name FROM enchants WHERE id IN (${unique.map(() => '?').join(',')})`).all(...unique) as Array<{ id: number; name: string }>
    return Object.fromEntries(rows.map(row => [row.id, row.name]))
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
