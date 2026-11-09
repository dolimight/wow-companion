import Database from 'better-sqlite3'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { INDEX_VERSION } from './engine'

/** Only invoked by the explicit desktop acceptance runner inside its isolated profile */
export async function createEnhancementFixture(directory: string) {
  const install = path.join(directory, 'fictional-game')
  const index = path.join(directory, 'gamedata')
  await mkdir(path.join(install, 'Data', 'data'), { recursive: true })
  await mkdir(index, { recursive: true })
  const version = '12.1.5.99999'
  await writeFile(path.join(install, '.build.info'), `Branch|Build Key|CDN Key|Version|Product|Active\nwow|fixture|fixture|${version}|wow|1\n`)
  const db = new Database(path.join(index, `items-${version}.sqlite`))
  try {
    db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE items(id INTEGER PRIMARY KEY,name TEXT,quality INTEGER,item_level INTEGER,required_level INTEGER,inventory_type INTEGER,class_id INTEGER,subclass_id INTEGER,icon INTEGER,expansion INTEGER,bonding INTEGER,sockets INTEGER,description TEXT,allowable_class_mask INTEGER,spec_ids TEXT,primary_stats TEXT);
      CREATE TABLE sources(item_id INTEGER,encounter TEXT,instance TEXT,kind TEXT,season INTEGER);
      CREATE TABLE enchants(id INTEGER,name TEXT,icon INTEGER);
      CREATE TABLE appearances(modified_id INTEGER,item_id INTEGER,appearance_id INTEGER,modifier INTEGER,icon INTEGER);
      CREATE VIRTUAL TABLE items_fts USING fts5(name,content='items',content_rowid='id');`)
    db.prepare('INSERT INTO meta VALUES (?,?)').run('index_version', String(INDEX_VERSION))
    const insert = db.prepare('INSERT INTO items VALUES (?,?,3,0,0,0,?,?,NULL,12,1,0,\'\',-1,\'[]\',\'[]\')')
    insert.run(99001, 'Enchant Head - Acceptance Fiery Focus', 8, 0)
    insert.run(99002, 'Enchant Chest - Acceptance Chest Only', 8, 4)
    insert.run(99003, 'Acceptance Ruby', 3, 0)
    insert.run(99004, 'Acceptance Sapphire', 3, 0)
    db.prepare('UPDATE items SET description = ? WHERE id = ?').run('+42 Intellect · Fictional acceptance enchant', 99001)
    db.prepare('UPDATE items SET description = ? WHERE id = ?').run('+37 Haste · Fictional acceptance gem', 99003)
    const name = 'Acceptance Crown of the Long-Named Arcane Expedition'
    db.prepare('INSERT INTO items VALUES (?, ?, 4, 300, 90, 1, 4, 1, NULL, 12, 1, 0, \'\', -1, \'[62]\', \'["intellect"]\')').run(99010, name)
    db.prepare('INSERT INTO items_fts(rowid,name) VALUES (?,?)').run(99010, name)
    db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?)').run(99010, 'Acceptance boss', 'Fictional acceptance dungeon', 'dungeon', 1)
    for (let index = 1; index <= 94; index++) {
      const id = 99100 + index
      const itemName = `Acceptance Crown ${String(index).padStart(3, '0')}`
      db.prepare('INSERT INTO items VALUES (?, ?, 4, ?, 90, 1, 4, 1, NULL, 12, 1, 0, \'\', -1, \'[62]\', \'["intellect"]\')').run(id, itemName, 300 - index)
      db.prepare('INSERT INTO items_fts(rowid,name) VALUES (?,?)').run(id, itemName)
      db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?)').run(id, 'Acceptance boss', 'Fictional acceptance dungeon', index % 2 ? 'dungeon' : 'raid', 1)
    }
    // The current index format adds stats, upgrade tracks, and effects; the fictional items leave them empty
    db.exec(`ALTER TABLE items ADD COLUMN stats TEXT;
      ALTER TABLE items ADD COLUMN item_set INTEGER;
      ALTER TABLE items ADD COLUMN track_groups TEXT;
      ALTER TABLE items ADD COLUMN latest_track INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE track_groups(group_id INTEGER PRIMARY KEY,scaling_set INTEGER NOT NULL,track_key INTEGER NOT NULL,levels TEXT NOT NULL);
      CREATE TABLE scaling(item_level INTEGER PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE armor_locations(inventory_type INTEGER PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE item_effects(item_id INTEGER NOT NULL,spell_id INTEGER NOT NULL,trigger_type INTEGER NOT NULL,cooldown_ms INTEGER NOT NULL,charges INTEGER NOT NULL,position INTEGER NOT NULL);
      CREATE TABLE spells(id INTEGER PRIMARY KEY,data TEXT NOT NULL);`)
  } finally { db.close() }
  return install
}
