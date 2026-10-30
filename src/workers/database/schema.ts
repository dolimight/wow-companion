import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
export const charactersTable = sqliteTable('characters', { id: text('id').primaryKey(), payload: text('payload').notNull() })
export const refsTable = sqliteTable('character_refs', { refKey: text('ref_key').primaryKey(), characterId: text('character_id').notNull().references(() => charactersTable.id) })
export const gearDraftsTable = sqliteTable('gear_drafts', { key: text('key').primaryKey(), characterId: text('character_id').notNull().references(() => charactersTable.id), payload: text('payload').notNull() })
export const outfitsTable = sqliteTable('outfits', { id: text('id').primaryKey(), characterId: text('character_id').notNull().references(() => charactersTable.id), payload: text('payload').notNull() })
export const metadataTable = sqliteTable('metadata', { key: text('key').primaryKey(), value: text('value').notNull() })
export const observationsTable = sqliteTable('observations', { key: text('key').primaryKey(), characterId: text('character_id').notNull().references(() => charactersTable.id), sessionId: text('session_id').notNull(), sequence: integer('sequence').notNull(), observedAt: text('observed_at').notNull(), digest: text('digest').notNull() })
