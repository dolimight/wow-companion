import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { addonEnvelopeSchema, addonRecordSchema, addCharacterSchema, appSettingsSchema, characterPatchSchema, characterSchema, gearDraftSchema, outfitSchema, ratingSchema, type AddCharacterInput, type AppSettings, type Character, type CharacterPatch, type GearDraft, type ImportReport, type Outfit, type ProviderRef, type Activity } from '../../shared/domain'
import * as schema from './schema'
import { statsSchema, specializationIdSchema, type AddonCharacterRecord, type InventoryObservation } from '../../shared/domain'
import { contentPreferencesSchema, defaultContentPreferences, type ContentPreferences } from '../../shared/season-rules'
import { vaultReward, weekStart, weeklySnapshotSchema, type WeeklySnapshot } from '../../shared/weekly'
import { demoCharacters } from '../../../fixtures/demo-characters'

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
function latestObservation<T extends {observedAt:string|null}>(preferred:T|null, other:T|null):T|null {
  if (!preferred) return other
  if (!other) return preferred
  return other.observedAt && (!preferred.observedAt || Date.parse(other.observedAt) > Date.parse(preferred.observedAt)) ? other : preferred
}
function refKey(ref: ProviderRef) {
  // Addon GUIDs survive renames and transfers
  return JSON.stringify([ref.provider, ref.edition, normalize(ref.region), ref.provider === 'addon' ? '' : normalize(ref.realmId), normalize(ref.characterKey)])
}
const contentPreferenceEntrySchema=z.object({characterId:z.string(),activity:z.enum(['mythicPlus','raiding','pvp']),preferences:contentPreferencesSchema})
const featureNamespaceSchema=z.string().regex(/^[a-z][a-z0-9-]{0,59}$/)
function featureJson(value:unknown):string {
  const text=JSON.stringify(value,(_key,item)=>{
    if(typeof item==='undefined'||typeof item==='function'||typeof item==='symbol'||typeof item==='bigint'||(typeof item==='number'&&!Number.isFinite(item)))throw new Error('Feature state must contain only JSON values')
    return item
  })
  if(!text||Buffer.byteLength(text,'utf8')>1024*1024)throw new Error('Feature state must be no larger than 1 MiB')
  return text
}
const featureStateEntrySchema=z.object({characterId:z.string(),namespace:featureNamespaceSchema,value:z.unknown().refine(value=>{try{featureJson(value);return true}catch{return false}},'Feature state must be bounded JSON')})
const backupSchema = z.object({ version: z.literal(1), exportedAt: z.string().datetime(), characters: z.array(characterSchema).max(1000), drafts: z.array(gearDraftSchema).max(10000), outfits: z.array(outfitSchema).max(10000), settings: appSettingsSchema, contentPreferences:z.array(contentPreferenceEntrySchema).max(3000).default([]),featureStates:z.array(featureStateEntrySchema).max(10000).default([]) })
/** Unavailable locations never replace their last real observation or acquire a newer timestamp */
export function mergeInventoryObservations(previous:InventoryObservation[]|undefined,incoming:InventoryObservation[]|undefined):InventoryObservation[]|undefined {
  if(!incoming)return previous
  const entries=new Map((previous??[]).map(entry=>[entry.location,entry]))
  for(const entry of incoming){
    const old=entries.get(entry.location)
    if(entry.coverage==='unknown'&&old)continue
    if(old?.observedAt&&(!entry.observedAt||Date.parse(entry.observedAt)<Date.parse(old.observedAt)))continue
    entries.set(entry.location,{...entry,items:retainUpgradeQuotes(entry.items,previous?.flatMap(value=>value.items)??[])})
  }
  return [...entries.values()]
}
function retainUpgradeQuotes<T extends Character['gear'][number]>(incoming:T[],previous:Character['gear']):T[]{
  return incoming.map(item=>{
    const quote=item.itemLink?previous.find(old=>old.itemLink===item.itemLink&&old.itemId===item.itemId&&old.observedUpgrade)?.observedUpgrade:undefined
    if(!quote)return item
    return !item.observedUpgrade||Date.parse(item.observedUpgrade.observedAt)<Date.parse(quote.observedAt)?{...item,observedUpgrade:quote}:item
  })
}
export type Backup = z.infer<typeof backupSchema>
/** The week is anchored to the region's reset schedule, falling back to the game's own reset countdown */
function addonWeekly(record: AddonCharacterRecord): WeeklySnapshot | null {
  const raw = record.weekly
  if (!raw) return null
  const observed = Date.parse(record.observedAt)
  const anchored = weekStart(record.region, observed)
  const fromGame = raw.weeklyResetAt ? Math.round((Date.parse(raw.weeklyResetAt) - 7 * 86_400_000) / 3_600_000) * 3_600_000 : null
  const start = anchored ?? fromGame
  if (start == null) return null
  return weeklySnapshotSchema.parse({
    source: 'addon', observedAt: record.observedAt, weekStart: new Date(start).toISOString(),
    vault: raw.vault.map(entry => ({ kind: entry.kind, index: entry.index, threshold: entry.threshold, progress: entry.progress, reward: entry.progress >= entry.threshold ? vaultReward(entry.kind, entry.level) : null })),
    lockouts: raw.lockouts, runs: raw.runs,
  })
}
export const providerExtrasSchema = z.object({ weekly: weeklySnapshotSchema.nullable().default(null), stats: statsSchema.nullable().default(null), talents: z.object({ loadout: z.string().min(1).max(400), specId: specializationIdSchema.default(null), source: z.string().max(60), observedAt: z.string().datetime().nullable().default(null) }).nullable().default(null) })
export type ProviderExtras = z.input<typeof providerExtrasSchema>
export const blizzardSnapshotSchema = z.object({
  characterId:z.number().int().positive(),name:z.string().min(1).max(100),realm:z.string().min(1).max(100),realmSlug:z.string().min(1).max(100),region:z.string().min(1).max(20),
  level:z.number().int().nullable(),itemLevel:z.number().nonnegative().nullable(),className:z.string().max(100).nullable(),specName:z.string().max(100).nullable(),specId:specializationIdSchema,raceName:z.string().max(100).nullable(),raceId:z.number().int().nullable(),sex:z.enum(['male','female']).nullable(),
  observedAt:z.string().datetime().nullable(),gear:characterSchema.shape.gear,observedTransmog:characterSchema.shape.observedTransmog,customization:characterSchema.shape.customization,
  renders:characterSchema.shape.renders,ratings:z.object({mythicPlus:ratingSchema.nullable(),pvp:ratingSchema.nullable()}),collectedAppearanceIds:z.array(z.number().int().positive()).max(100000).nullable().default(null),
}).merge(providerExtrasSchema)
export type BlizzardSnapshot = z.input<typeof blizzardSnapshotSchema>
export function validateBackup(input: unknown): Backup { return backupSchema.parse(input) }

export class DatabaseRepository {
  private sqlite: Database.Database
  private db: ReturnType<typeof drizzle<typeof schema>>
  constructor(path: string) {
    this.sqlite = new Database(path)
    this.sqlite.pragma('journal_mode = WAL')
    this.sqlite.pragma('foreign_keys = ON')
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS character_refs (ref_key TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id));
      CREATE TABLE IF NOT EXISTS gear_drafts (key TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outfits (id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (key TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), session_id TEXT NOT NULL, sequence INTEGER NOT NULL, observed_at TEXT NOT NULL, digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identity_audit (id INTEGER PRIMARY KEY, character_id TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS content_preferences (key TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feature_states (character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, namespace TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(character_id,namespace));
      INSERT OR IGNORE INTO metadata (key, value) VALUES ('revision', '0');`)
    this.db = drizzle(this.sqlite, { schema })
  }
  close() { this.sqlite.close() }
  get revision(): number { return Number((this.sqlite.prepare('SELECT value FROM metadata WHERE key = ?').get('revision') as {value:string}).value) }
  getRevision(): number {return this.revision}
  private bump() { this.sqlite.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'").run() }
  listCharacters(includeArchived = false): Character[] { return this.db.select().from(schema.charactersTable).all().map(row => characterSchema.parse(JSON.parse(row.payload))).filter(c => includeArchived || !c.archived).sort((a,b) => Number(b.isMain) - Number(a.isMain) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)) }
  getCharacter(id: string): Character | null { const row = this.db.select().from(schema.charactersTable).where(eq(schema.charactersTable.id, id)).get(); return row ? characterSchema.parse(JSON.parse(row.payload)) : null }
  private requireCharacter(id: string) { const character = this.getCharacter(id); if (!character) throw new Error('Character was not found'); return character }
  resolveIdentity(refs: ProviderRef[]): { kind: 'new' } | { kind: 'matched'; characterId: string } | { kind: 'review'; conflictingIds: string[] } {
    const ids = [...new Set(refs.flatMap(ref => { const row = this.db.select().from(schema.refsTable).where(eq(schema.refsTable.refKey, refKey(ref))).get(); return row ? [row.characterId] : [] }))]
    return ids.length === 0 ? { kind: 'new' } : ids.length === 1 ? { kind: 'matched', characterId: ids[0]! } : { kind: 'review', conflictingIds: ids }
  }
  private putCharacter(character: Character) {
    for (const ref of character.sourceRefs) { const match = this.db.select().from(schema.refsTable).where(eq(schema.refsTable.refKey, refKey(ref))).get(); if (match && match.characterId !== character.id) throw new Error('Source identity belongs to another character') }
    this.db.insert(schema.charactersTable).values({id:character.id,payload:JSON.stringify(character)}).onConflictDoUpdate({target:schema.charactersTable.id,set:{payload:JSON.stringify(character)}}).run()
    for (const ref of character.sourceRefs) this.db.insert(schema.refsTable).values({refKey:refKey(ref),characterId:character.id}).onConflictDoNothing().run()
  }
  addCharacter(input: AddCharacterInput): Character {
    const parsed = addCharacterSchema.parse(input)
    const refs = parsed.sourceRefs.length ? parsed.sourceRefs : [{provider:'manual' as const,edition:'retail' as const,region:parsed.region,realmId:parsed.realm,characterKey:parsed.name}]
    const identity = this.resolveIdentity(refs)
    if (identity.kind === 'review') throw new Error('Conflicting source identities require review')
    if (identity.kind === 'matched') return this.requireCharacter(identity.characterId)
    const character = characterSchema.parse({...parsed,id:randomUUID(),sourceRefs:refs})
    this.sqlite.transaction(() => { if (character.isMain) this.clearMain(); this.putCharacter(character); this.bump() })()
    return character
  }
  private removedRefs() { const row = this.sqlite.prepare('SELECT value FROM metadata WHERE key = ?').get('removed_refs') as { value: string } | undefined; return new Set<string>(row ? JSON.parse(row.value) : []) }
  private clearMain() { for (const c of this.listCharacters(true)) if (c.isMain) this.putCharacter({...c,isMain:false}) }
  updateCharacter(id: string, patch: CharacterPatch): Character { const parsed = characterPatchSchema.parse(patch); const character = {...this.requireCharacter(id),...parsed}; this.sqlite.transaction(() => { if (parsed.isMain) this.clearMain(); this.putCharacter(character); this.bump() })(); return character }
  /**
   * Removes a character with its plans, outfits, and history. Its addon identity is remembered so the next
   * sync does not bring it straight back; characters from Blizzard are only added when the player imports them
   */
  deleteCharacter(id: string): { deleted: boolean } {
    const character = this.getCharacter(id)
    if (!character) return { deleted: false }
    this.sqlite.transaction(() => {
      const removed = new Set<string>(JSON.parse((this.sqlite.prepare('SELECT value FROM metadata WHERE key = ?').get('removed_refs') as { value: string } | undefined)?.value ?? '[]'))
      for (const ref of character.sourceRefs) if (ref.provider === 'addon') removed.add(refKey(ref))
      this.sqlite.prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('removed_refs', JSON.stringify([...removed]))
      for (const table of ['gear_drafts', 'outfits', 'observations', 'character_refs', 'content_preferences', 'feature_states']) this.sqlite.prepare(`DELETE FROM ${table} WHERE character_id = ?`).run(id)
      this.sqlite.prepare('DELETE FROM identity_audit WHERE character_id = ?').run(id)
      this.sqlite.prepare('DELETE FROM characters WHERE id = ?').run(id)
      const settings = this.getSettings()
      if (settings.lastCharacterId === id || id in settings.characterActivities) {
        const { [id]: _gone, ...activities } = settings.characterActivities
        this.setSettings({ lastCharacterId: settings.lastCharacterId === id ? null : settings.lastCharacterId, characterActivities: activities })
      }
      this.bump()
    })()
    return { deleted: true }
  }
  archiveCharacter(id: string) { return this.updateCharacter(id,{archived:true}) }
  restoreCharacter(id: string) { return this.updateCharacter(id,{archived:false}) }
  private mergeProviderRatings(character:Character,input:Partial<Character['ratings']>):Character['ratings'] {
    const ratings={...character.ratings}
    for(const activity of ['mythicPlus','raiding','pvp'] as const){const raw=input[activity];if(raw==null)continue;const incoming=ratingSchema.parse(raw);const current=ratings[activity];if(current?.observedAt&&(!incoming.observedAt||Date.parse(incoming.observedAt)<Date.parse(current.observedAt)))continue;ratings[activity]=incoming}
    return ratings
  }
  applyProviderRatings(id:string,input:Partial<Character['ratings']>):Character {
    const character=this.requireCharacter(id);const ratings=this.mergeProviderRatings(character,input)
    if(JSON.stringify(character.ratings)===JSON.stringify(ratings))return character
    const updated={...character,ratings};this.sqlite.transaction(()=>{this.putCharacter(updated);this.bump()})();return updated
  }
  applyProviderProfile(id:string,profile:{character:AddCharacterInput;ratings:Partial<Character['ratings']>;sourceUrl:string;observedAt:string|null;extras?:ProviderExtras}):Character {
    const current=this.requireCharacter(id);const incoming=addCharacterSchema.parse(profile.character)
    const canonical=(value:string)=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'')
    if(canonical(current.region)!==canonical(incoming.region)||canonical(current.realm)!==canonical(incoming.realm)||normalize(current.name)!==normalize(incoming.name))throw new Error('Provider profile does not match this character')
    const sourceUrl=z.string().url().parse(profile.sourceUrl);const url=new URL(sourceUrl)
    if(url.protocol!=='https:'||url.hostname!=='raider.io')throw new Error('Provider profile source is not supported')
    const observedAt=z.string().datetime().nullable().parse(profile.observedAt)
    const updated:Character={...this.withExtras(current,'raiderio',profile.extras??{}),ratings:this.mergeProviderRatings(current,profile.ratings)}
    for(const key of ['className','raceName','specName'] as const)if((!current[key]||current[key]==='Unknown')&&incoming[key]&&incoming[key]!=='Unknown')updated[key]=incoming[key]
    for(const key of ['specId','raceId','level'] as const)if(current[key]===null&&incoming[key]!==null)updated[key]=incoming[key]
    const hasAddonObservation=current.gear.length>0&&(current.gearSource==='addon'||(current.sourceRefs.some(ref=>ref.provider==='addon')&&current.gearCoverage!=='unknown'))
    const mayFill=(!current.gear.length||current.gearCoverage==='unknown')&&!hasAddonObservation
    if(mayFill&&(incoming.gear.length>0||incoming.itemLevel!==null)) {
      updated.gear=incoming.gear;updated.itemLevel=incoming.itemLevel;updated.gearCoverage=incoming.gearCoverage
      updated.gearSource='Raider.IO';updated.gearSourceUrl=sourceUrl;updated.gearObservedAt=observedAt
      // The source's observation time stays unknown when absent; retrieval never becomes observation
      if(!current.sourceRefs.some(ref=>ref.provider==='addon'))updated.observedAt=observedAt
      updated.importedAt=new Date().toISOString()
    }
    if(JSON.stringify(updated)===JSON.stringify(current))return current
    this.sqlite.transaction(()=>{this.putCharacter(updated);this.bump()})();return updated
  }
  /** Finds an existing character by provider identity, then by region, realm, and name so imports never duplicate an addon character */
  findCharacterByRef(ref:ProviderRef,name:string,realmName:string):Character|null {
    const identity=this.resolveIdentity([ref])
    if(identity.kind==='matched')return this.getCharacter(identity.characterId)
    const canonical=(value:string)=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'')
    return this.listCharacters(true).find(c=>!c.demo&&canonical(c.region)===canonical(ref.region)&&normalize(c.name)===normalize(name)&&(canonical(c.realm)===canonical(ref.realmId)||canonical(c.realm)===canonical(realmName))&&c.sourceRefs.every(existing=>existing.provider!=='blizzard'))??null
  }
  /** Blizzard reflects the character at last logout; a newer addon gear observation is kept */
  applyBlizzardProfile(id:string,input:BlizzardSnapshot):Character {
    const current=this.requireCharacter(id);const profile=blizzardSnapshotSchema.parse(input)
    const canonical=(value:string)=>normalize(value).replace(/[^\p{L}\p{N}]/gu,'')
    if(canonical(current.region)!==canonical(profile.region)||canonical(current.realm)!==canonical(profile.realm)||normalize(current.name)!==normalize(profile.name))throw new Error('Blizzard profile does not match this character')
    const newer=(at:string|null|undefined)=>!at||!profile.observedAt||Date.parse(profile.observedAt)>=Date.parse(at)
    const updated:Character={...this.withExtras(current,'blizzard',profile),ratings:this.mergeProviderRatings(current,profile.ratings)}
    if(newer(current.observedAt)){
      for(const key of ['className','raceName','specName'] as const){const value=profile[key];if(value)updated[key]=value}
      for(const key of ['specId','raceId','level'] as const){const value=profile[key];if(value!=null)updated[key]=value}
    } else {
      for(const key of ['className','raceName','specName'] as const){const value=profile[key];if(value&&(!current[key]||current[key]==='Unknown'))updated[key]=value}
      for(const key of ['specId','raceId','level'] as const){const value=profile[key];if(value!=null&&current[key]==null)updated[key]=value}
    }
    if(profile.sex)updated.sex=profile.sex
    const addonGearIsNewer=current.gear.length>0&&current.gearSource==='addon'&&!newer(current.gearObservedAt)
    if(!addonGearIsNewer&&profile.gear.length){updated.gear=profile.gear;updated.itemLevel=profile.itemLevel??current.itemLevel;updated.gearCoverage='complete';updated.gearSource='Blizzard';updated.gearSourceUrl=null;updated.gearObservedAt=profile.observedAt;updated.importedAt=new Date().toISOString();if(!current.sourceRefs.some(ref=>ref.provider==='addon'))updated.observedAt=profile.observedAt}
    if(profile.customization.length){updated.customization=profile.customization;updated.customizationCoverage='complete'}
    if(Object.keys(profile.observedTransmog).length){updated.observedTransmog=profile.observedTransmog;updated.observedTransmogAt=profile.observedAt}
    if(profile.renders)updated.renders=profile.renders
    if(profile.collectedAppearanceIds){updated.collectedAppearanceIds=profile.collectedAppearanceIds;updated.collectionScopeId='battlenet-account';updated.collectionCoverage='partial'}
    const ref:ProviderRef={provider:'blizzard',edition:'retail',region:profile.region,realmId:profile.realmSlug,characterKey:String(profile.characterId)}
    if(!current.sourceRefs.some(existing=>refKey(existing)===refKey(ref)))updated.sourceRefs=[...current.sourceRefs,ref]
    if(JSON.stringify(updated)===JSON.stringify(current))return current
    this.sqlite.transaction(()=>{this.putCharacter(updated);this.bump()})();return updated
  }
  /** Provider extras are stored per source; an older observation never replaces a newer one */
  private withExtras(character:Character,source:'raiderio'|'blizzard',input:ProviderExtras):Character {
    const extras=providerExtrasSchema.parse(input);const updated={...character}
    if(extras.weekly){const current=character.weekly[source];if(!current||Date.parse(extras.weekly.observedAt)>=Date.parse(current.observedAt))updated.weekly={...character.weekly,[source]:extras.weekly}}
    const newer=(next:{observedAt:string|null},current:{observedAt:string|null}|null)=>!current||!current.observedAt||!next.observedAt||Date.parse(next.observedAt)>=Date.parse(current.observedAt)
    if(extras.stats&&newer(extras.stats,character.stats))updated.stats=extras.stats
    if(extras.talents&&newer(extras.talents,character.talents))updated.talents=extras.talents
    return updated
  }
  saveGearDraft(input: GearDraft): GearDraft {
    const draft = gearDraftSchema.parse({...input,specId:specializationIdSchema.parse(input.specId)})
    this.requireCharacter(draft.characterId)
    const key = JSON.stringify([draft.characterId,draft.specId,draft.activity,draft.rulesetId])
    this.sqlite.transaction(() => {
      this.db.insert(schema.gearDraftsTable).values({key,characterId:draft.characterId,payload:JSON.stringify(draft)}).onConflictDoUpdate({target:schema.gearDraftsTable.key,set:{payload:JSON.stringify(draft)}}).run()
      if (draft.specId === null) {
        const legacyKey = JSON.stringify([draft.characterId,0,draft.activity,draft.rulesetId])
        const legacy = this.db.select().from(schema.gearDraftsTable).where(eq(schema.gearDraftsTable.key,legacyKey)).get()
        if (legacy && gearDraftSchema.parse(JSON.parse(legacy.payload)).id === draft.id) this.sqlite.prepare('DELETE FROM gear_drafts WHERE key = ?').run(legacyKey)
      }
      this.bump()
    })()
    return draft
  }
  getGearDraft(context: {characterId:string;specId:number|null;activity:Activity;rulesetId?:string}): GearDraft | null {
    const specId = specializationIdSchema.parse(context.specId)
    const find = (id:number|null) => this.db.select().from(schema.gearDraftsTable).where(eq(schema.gearDraftsTable.key,JSON.stringify([context.characterId,id,context.activity,context.rulesetId ?? 'unknown']))).get()
    const row = find(specId) ?? (specId === null ? find(0) : undefined)
    return row ? {...gearDraftSchema.parse(JSON.parse(row.payload)),specId} : null
  }
  saveOutfit(input: z.input<typeof outfitSchema>): Outfit { const outfit = outfitSchema.parse(input); this.requireCharacter(outfit.characterId); const existing = this.db.select().from(schema.outfitsTable).where(eq(schema.outfitsTable.id,outfit.id)).get(); if(existing && existing.characterId !== outfit.characterId) throw new Error('Outfit belongs to another character'); this.sqlite.transaction(() => { this.db.insert(schema.outfitsTable).values({id:outfit.id,characterId:outfit.characterId,payload:JSON.stringify(outfit)}).onConflictDoUpdate({target:schema.outfitsTable.id,set:{payload:JSON.stringify(outfit)}}).run();this.bump() })();return outfit }
  listOutfits(characterId: string): Outfit[] { return this.db.select().from(schema.outfitsTable).where(eq(schema.outfitsTable.characterId,characterId)).all().map(row => outfitSchema.parse(JSON.parse(row.payload))) }
  deleteOutfit(id: string, characterId?:string) { const existing=this.db.select().from(schema.outfitsTable).where(eq(schema.outfitsTable.id,id)).get();if(characterId&&existing&&existing.characterId!==characterId)throw new Error('Outfit belongs to another character');this.sqlite.transaction(()=>{this.db.delete(schema.outfitsTable).where(eq(schema.outfitsTable.id,id)).run();this.bump()})();return {deleted:!!existing} }
  seedDemo(): Character[] { this.sqlite.transaction(()=>{for(const c of demoCharacters())if(!this.getCharacter(c.id)){const copy={...c,isMain:c.isMain&&!this.listCharacters(true).some(other=>other.isMain)};this.putCharacter(copy)}this.bump()})();return this.listCharacters() }
  getSettings(): AppSettings { const row = this.db.select().from(schema.metadataTable).where(eq(schema.metadataTable.key,'settings')).get(); return appSettingsSchema.parse(row ? JSON.parse(row.value) : {}) }
  getContentPreferences(characterId:string,activity:Activity):ContentPreferences {
    this.requireCharacter(characterId)
    const row=this.sqlite.prepare('SELECT payload FROM content_preferences WHERE key = ?').get(JSON.stringify([characterId,activity])) as {payload:string}|undefined
    return row?contentPreferenceEntrySchema.parse(JSON.parse(row.payload)).preferences:defaultContentPreferences(activity)
  }
  setContentPreferences(characterId:string,activity:Activity,input:ContentPreferences):ContentPreferences {
    this.requireCharacter(characterId)
    const entry=contentPreferenceEntrySchema.parse({characterId,activity,preferences:input})
    this.sqlite.transaction(()=>{
      this.sqlite.prepare('INSERT INTO content_preferences (key,character_id,payload) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload').run(JSON.stringify([characterId,activity]),characterId,JSON.stringify(entry))
      this.bump()
    })()
    return entry.preferences
  }
  getFeatureState(characterId:string,namespace:string):unknown|null {
    this.requireCharacter(characterId);featureNamespaceSchema.parse(namespace)
    const row=this.sqlite.prepare('SELECT payload FROM feature_states WHERE character_id = ? AND namespace = ?').get(characterId,namespace) as {payload:string}|undefined
    return row?JSON.parse(row.payload):null
  }
  saveFeatureState(characterId:string,namespace:string,value:unknown):unknown {
    this.requireCharacter(characterId);featureNamespaceSchema.parse(namespace);const payload=featureJson(value)
    this.sqlite.transaction(()=>{this.sqlite.prepare('INSERT INTO feature_states (character_id,namespace,payload) VALUES (?,?,?) ON CONFLICT(character_id,namespace) DO UPDATE SET payload = excluded.payload').run(characterId,namespace,payload);this.bump()})()
    return JSON.parse(payload)
  }
  setSettings(input: Partial<AppSettings>): AppSettings { const settings = appSettingsSchema.parse({...this.getSettings(),...input}); this.db.insert(schema.metadataTable).values({key:'settings',value:JSON.stringify(settings)}).onConflictDoUpdate({target:schema.metadataTable.key,set:{value:JSON.stringify(settings)}}).run();return settings }
  getCollectionStatus(characterId: string, appearanceId: number): 'collected'|'missing'|'unknown' { const c = this.requireCharacter(characterId); if (!c.collectionScopeId || c.collectionCoverage === 'unknown') return 'unknown'; if (c.collectedAppearanceIds.includes(appearanceId)) return 'collected'; return c.collectionCoverage === 'complete' ? 'missing' : 'unknown' }
  importSnapshot(input: unknown): ImportReport {
    const envelope = addonEnvelopeSchema.parse(input)
    const report: ImportReport = {imported:[],unchanged:[],errors:[],revision:this.revision}
    this.sqlite.transaction(() => {
      for (const [recordKey,raw] of Object.entries(envelope.characters)) {
        const result = addonRecordSchema.safeParse(raw)
        if (!result.success) { report.errors.push({recordKey,reason:'Invalid character record'});continue }
        const record = result.data
        if (recordKey !== record.guid) { report.errors.push({recordKey,reason:'Record key does not match character GUID'});continue }
        const ref: ProviderRef = {provider:'addon',edition:'retail',region:record.region,realmId:record.realm,characterKey:record.guid}
        if (this.removedRefs().has(refKey(ref))) continue
        const identity = this.resolveIdentity([ref])
        if (identity.kind === 'review') { report.errors.push({recordKey,reason:'Conflicting identities require review'});continue }
        let previous = identity.kind === 'matched' ? this.requireCharacter(identity.characterId) : null
        const key = JSON.stringify([envelope.sourceProfileId,refKey(ref)])
        const observation = this.db.select().from(schema.observationsTable).where(eq(schema.observationsTable.key,key)).get()
        const digest = createHash('sha256').update(JSON.stringify(record)).digest('hex')
        if (observation?.digest === digest) { if(previous) report.unchanged.push(previous.id);continue }
        const staleSequence = observation && observation.sessionId === record.sessionId && record.sequence <= observation.sequence
        // Only an earlier addon snapshot can make this one stale; a provider's crawl time says nothing about in-game data
        const staleTime = previous?.observedAt && previous.sourceRefs.some(existing => existing.provider === 'addon') && (Date.parse(record.observedAt) < Date.parse(previous.observedAt) || (Date.parse(record.observedAt) === Date.parse(previous.observedAt) && observation?.sessionId !== record.sessionId))
        if (staleSequence || staleTime) { report.errors.push({recordKey,reason:'Stale or conflicting observation preserved the current snapshot'});continue }
        // Join only one unambiguous public/manual identity, after checking the original GUID's history
        const canon = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]/gu, '')
        const twins = this.listCharacters(true).filter(c => !c.demo && c.id !== previous?.id && !c.sourceRefs.some(existing => existing.provider === 'addon') && canon(c.region) === canon(record.region) && canon(c.realm) === canon(record.realm) && normalize(c.name) === normalize(record.name))
        if (twins.length > 1) { report.errors.push({recordKey,reason:'Multiple matching characters require identity review'});continue }
        const twin = twins[0]
        if (twin && previous) {
          const featureStates=this.sqlite.prepare('SELECT namespace,payload FROM feature_states WHERE character_id = ?').all(previous.id) as {namespace:string;payload:string}[]
          if(featureStates.some(entry=>{const other=this.sqlite.prepare('SELECT payload FROM feature_states WHERE character_id = ? AND namespace = ?').get(twin.id,entry.namespace) as {payload:string}|undefined;return other&&other.payload!==entry.payload})){report.errors.push({recordKey,reason:'Matching characters have separate feature history requiring identity review'});continue}
          const preferences=(this.sqlite.prepare('SELECT payload FROM content_preferences WHERE character_id = ?').all(previous.id) as {payload:string}[]).map(row=>contentPreferenceEntrySchema.parse(JSON.parse(row.payload)))
          if(preferences.some(entry=>{const row=this.sqlite.prepare('SELECT payload FROM content_preferences WHERE key = ?').get(JSON.stringify([twin.id,entry.activity])) as {payload:string}|undefined;return row&&JSON.stringify(contentPreferenceEntrySchema.parse(JSON.parse(row.payload)).preferences)!==JSON.stringify(entry.preferences)})){report.errors.push({recordKey,reason:'Matching characters have separate progression preferences requiring identity review'});continue}
          const drafts = this.db.select().from(schema.gearDraftsTable).where(eq(schema.gearDraftsTable.characterId, previous.id)).all().map(row => ({ oldKey: row.key, draft: gearDraftSchema.parse(JSON.parse(row.payload)) }))
          const movedDrafts = drafts.map(({oldKey,draft}) => ({oldKey,draft:{...draft,characterId:twin.id},key:JSON.stringify([twin.id,draft.specId,draft.activity,draft.rulesetId])}))
          if (movedDrafts.some(({key}) => this.sqlite.prepare('SELECT 1 FROM gear_drafts WHERE key = ?').get(key))) { report.errors.push({recordKey,reason:'Matching characters have separate gear plans requiring identity review'});continue }
          for (const {oldKey,key,draft} of movedDrafts) this.sqlite.prepare('UPDATE gear_drafts SET key = ?, character_id = ?, payload = ? WHERE key = ?').run(key,twin.id,JSON.stringify(draft),oldKey)
          for (const row of this.db.select().from(schema.outfitsTable).where(eq(schema.outfitsTable.characterId,previous.id)).all()) {
            const outfit = outfitSchema.parse(JSON.parse(row.payload))
            this.sqlite.prepare('UPDATE outfits SET character_id = ?, payload = ? WHERE id = ?').run(twin.id,JSON.stringify({...outfit,characterId:twin.id}),row.id)
          }
          for (const table of ['observations','character_refs','identity_audit']) this.sqlite.prepare(`UPDATE ${table} SET character_id = ? WHERE character_id = ?`).run(twin.id,previous.id)
          for(const entry of preferences){const moved={...entry,characterId:twin.id};this.sqlite.prepare('INSERT OR IGNORE INTO content_preferences (key,character_id,payload) VALUES (?,?,?)').run(JSON.stringify([twin.id,entry.activity]),twin.id,JSON.stringify(moved))}
          this.sqlite.prepare('DELETE FROM content_preferences WHERE character_id = ?').run(previous.id)
          for(const entry of featureStates)this.sqlite.prepare('INSERT OR IGNORE INTO feature_states (character_id,namespace,payload) VALUES (?,?,?)').run(twin.id,entry.namespace,entry.payload)
          this.sqlite.prepare('DELETE FROM feature_states WHERE character_id = ?').run(previous.id)
          const settings = this.getSettings()
          const activities = {...settings.characterActivities}
          if (activities[previous.id] && !activities[twin.id]) activities[twin.id] = activities[previous.id]!
          delete activities[previous.id]
          this.setSettings({lastCharacterId:settings.lastCharacterId===previous.id?twin.id:settings.lastCharacterId,characterActivities:activities})
          this.sqlite.prepare('DELETE FROM characters WHERE id = ?').run(previous.id)
          const gear = previous.gear.length && (!twin.gear.length || (Date.parse(previous.gearObservedAt ?? '') || 0) > (Date.parse(twin.gearObservedAt ?? '') || 0)) ? previous : twin
          const collection = twin.collectionCoverage === 'unknown' ? previous : twin
          const appearance = twin.customizationCoverage === 'unknown' ? previous : twin
          const transmog = latestObservation(
            Object.keys(twin.observedTransmog).length ? {observedAt:twin.observedTransmogAt,slots:twin.observedTransmog} : null,
            Object.keys(previous.observedTransmog).length ? {observedAt:previous.observedTransmogAt,slots:previous.observedTransmog} : null,
          )
          previous = {
            ...previous, ...twin,
            gear:gear.gear, itemLevel:gear.itemLevel, gearCoverage:gear.gearCoverage,
            gearSource:gear.gearSource, gearSourceUrl:gear.gearSourceUrl, gearObservedAt:gear.gearObservedAt,
            stats:latestObservation(twin.stats,previous.stats), talents:latestObservation(twin.talents,previous.talents), renders:latestObservation(twin.renders,previous.renders),
            targetItemLevel:twin.targetItemLevel??previous.targetItemLevel, sex:twin.sex??previous.sex,
            inventoryObservations:mergeInventoryObservations(previous.inventoryObservations,twin.inventoryObservations),
            observedTransmog:transmog?.slots??{}, observedTransmogAt:transmog?.observedAt??null,
            favorite:twin.favorite||previous.favorite, isMain:twin.isMain||previous.isMain,
            customization:appearance.customization, customizationCoverage:appearance.customizationCoverage,
            collectionObservedAt:collection.collectionObservedAt,collectedAppearanceIds:collection.collectedAppearanceIds, collectionCoverage:collection.collectionCoverage, collectionScopeId:collection.collectionScopeId,
            ratings:this.mergeProviderRatings(twin,previous.ratings),
            weekly:{addon:latestObservation(twin.weekly.addon,previous.weekly.addon),raiderio:latestObservation(twin.weekly.raiderio,previous.weekly.raiderio),blizzard:latestObservation(twin.weekly.blizzard,previous.weekly.blizzard)},
            sourceRefs:[...twin.sourceRefs,...previous.sourceRefs],
          }
        } else if (twin) previous = twin
        const { weekly: _rawWeekly, talentLoadout, ...fields } = record
        // Fields the addon cannot observe yet keep the values another source already provided
        const unobserved = previous ? { progressionResources: record.progressionResources ?? previous.progressionResources, sex: previous.sex, renders: previous.renders, observedTransmog: previous.observedTransmog, observedTransmogAt: previous.observedTransmogAt, stats: previous.stats, ...(record.specId === null && previous.specId !== null && (record.specName === 'Unknown' || record.specName === previous.specName) ? {specId:previous.specId,specName:previous.specName} : {}), ...(fields.customizationCoverage === 'unknown' ? { customization: previous.customization, customizationCoverage: previous.customizationCoverage } : {}), ...(fields.collectionCoverage === 'unknown' ? { collectionObservedAt:previous.collectionObservedAt,collectedAppearanceIds: previous.collectedAppearanceIds, collectionCoverage: previous.collectionCoverage, collectionScopeId: previous.collectionScopeId } : {}) } : {}
        const weekly = { ...(previous?.weekly ?? { addon: null, raiderio: null, blizzard: null }), addon: addonWeekly(record) ?? previous?.weekly.addon ?? null }
        const talents = talentLoadout ? { loadout: talentLoadout, specId: record.specId, source: 'In-game talents', observedAt: record.observedAt } : previous?.talents ?? null
        // Empty item lists are also produced while the client is shutting down or loading
        // Keep the last known gear and its real observation time while accepting weekly/talent updates
        const preserveGear = !record.gear.length && previous && (previous.gear.length > 0 || (!record.itemLevel && (previous.itemLevel ?? 0) > 0))
        const gear = preserveGear && previous ? {gear:previous.gear,itemLevel:previous.itemLevel,gearCoverage:previous.gearCoverage,gearSource:previous.gearSource,gearSourceUrl:previous.gearSourceUrl,gearObservedAt:previous.gearObservedAt} : !record.gear.length ? {gearCoverage:'unknown',itemLevel:record.itemLevel||null,gearSource:record.itemLevel?'addon':null,gearSourceUrl:null,gearObservedAt:record.itemLevel?record.observedAt:null} : {gearSource:'addon',gearSourceUrl:null,gearObservedAt:record.observedAt}
        const inventoryObservations=mergeInventoryObservations(previous?.inventoryObservations,record.inventoryObservations)
        const character = characterSchema.parse({...fields,...unobserved,...gear,weekly,talents,inventoryObservations,id:previous?.id ?? randomUUID(),edition:'retail',importedAt:new Date().toISOString(),sourceRefs:[...(previous?.sourceRefs ?? []).filter(r => r.provider !== 'addon'),ref],archived:previous?.archived ?? false,favorite:previous?.favorite ?? false,isMain:previous?.isMain ?? false,targetItemLevel:previous?.targetItemLevel ?? null,maxItemLevel:null,ratings:previous?.ratings ?? {mythicPlus:null,raiding:null,pvp:null},demo:false})
        character.gear=retainUpgradeQuotes(character.gear,[...(previous?.gear??[]),...(previous?.inventoryObservations?.flatMap(value=>value.items)??[])])
        this.putCharacter(character)
        this.db.insert(schema.observationsTable).values({key,characterId:character.id,sessionId:record.sessionId,sequence:record.sequence,observedAt:record.observedAt,digest}).onConflictDoUpdate({target:schema.observationsTable.key,set:{characterId:character.id,sessionId:record.sessionId,sequence:record.sequence,observedAt:record.observedAt,digest}}).run()
        this.sqlite.prepare('INSERT INTO identity_audit (character_id,event,at) VALUES (?,?,?)').run(character.id,previous && previous.name !== character.name ? 'Observed rename with matching GUID' : 'Imported addon snapshot',new Date().toISOString())
        report.imported.push(character.id)
      }
      if(report.imported.length) this.bump()
    })()
    report.revision = this.revision
    return report
  }
  exportBackup(): Backup { return {featureStates:(this.sqlite.prepare('SELECT character_id,namespace,payload FROM feature_states ORDER BY character_id,namespace').all() as {character_id:string;namespace:string;payload:string}[]).map(row=>({characterId:row.character_id,namespace:row.namespace,value:JSON.parse(row.payload)})),version:1,exportedAt:new Date().toISOString(),characters:this.listCharacters(true),drafts:this.db.select().from(schema.gearDraftsTable).all().map(row => gearDraftSchema.parse(JSON.parse(row.payload))),outfits:this.db.select().from(schema.outfitsTable).all().map(row => outfitSchema.parse(JSON.parse(row.payload))),settings:this.getSettings(),contentPreferences:(this.sqlite.prepare('SELECT payload FROM content_preferences ORDER BY key').all() as {payload:string}[]).map(row=>contentPreferenceEntrySchema.parse(JSON.parse(row.payload)))} }
  importBackup(input: unknown): {characters:number;revision:number} {
    const backup = validateBackup(input)
    for(const entry of backup.featureStates)featureJson(entry.value)
    const ids = new Set(backup.characters.map(c => c.id)); if(ids.size !== backup.characters.length) throw new Error('Backup has duplicate character IDs')
    if(backup.characters.filter(c => c.isMain).length > 1) throw new Error('Backup has more than one main character')
    for(const entry of [...backup.drafts,...backup.outfits]) if(!ids.has(entry.characterId)) throw new Error('Backup contains an orphaned plan')
    for(const entry of backup.featureStates)if(!ids.has(entry.characterId))throw new Error('Backup contains orphaned feature state')
    if(new Set(backup.featureStates.map(entry=>JSON.stringify([entry.characterId,entry.namespace]))).size!==backup.featureStates.length)throw new Error('Backup contains duplicate feature state')
    for(const entry of backup.contentPreferences) if(!ids.has(entry.characterId)) throw new Error('Backup contains orphaned progression preferences')
    if(new Set(backup.contentPreferences.map(entry=>JSON.stringify([entry.characterId,entry.activity]))).size!==backup.contentPreferences.length) throw new Error('Backup contains duplicate progression preferences')
    this.sqlite.transaction(() => { for(const c of backup.characters) this.putCharacter(c); for(const d of backup.drafts) this.saveGearDraft(d); for(const o of backup.outfits) this.saveOutfit(o);for(const entry of backup.contentPreferences)this.setContentPreferences(entry.characterId,entry.activity,entry.preferences);for(const entry of backup.featureStates)this.saveFeatureState(entry.characterId,entry.namespace,entry.value);this.setSettings(backup.settings);this.bump() })()
    return {characters:backup.characters.length,revision:this.revision}
  }
}

