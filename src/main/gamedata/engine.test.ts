import {afterEach,describe,expect,it} from 'vite-plus/test'
import Database from 'better-sqlite3'
import {mkdtempSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {GameDataEngine,INDEX_VERSION} from './engine'
import type {WowInstall} from './install'
import type {Row} from './wdc'

const open:GameDataEngine[]=[]
const folders:string[]=[]
afterEach(async()=>{for(const engine of open.splice(0))await engine.close();for(const folder of folders.splice(0))rmSync(folder,{recursive:true,force:true})})
const install:WowInstall={root:'C:/fixture-wow',retail:'C:/fixture-wow/_retail_',build:{branch:'wow',buildKey:'fixture',cdnKey:'fixture',version:'12.1.5.70448',product:'wow',build:70448}}

function fixture(version=INDEX_VERSION) {
  const folder=mkdtempSync(path.join(tmpdir(),'wow-search-'));folders.push(folder)
  const db=new Database(path.join(folder,`items-${install.build.version}.sqlite`))
  db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE items(id INTEGER PRIMARY KEY,name TEXT,quality INTEGER,item_level INTEGER,required_level INTEGER,inventory_type INTEGER,class_id INTEGER,subclass_id INTEGER,icon INTEGER,expansion INTEGER,bonding INTEGER,sockets INTEGER,description TEXT${version===2?',allowable_class_mask INTEGER,spec_ids TEXT,primary_stats TEXT':''});
    CREATE TABLE sources(item_id INTEGER,encounter TEXT,instance TEXT,kind TEXT,season INTEGER);
    CREATE TABLE appearances(modified_id INTEGER,item_id INTEGER,appearance_id INTEGER,modifier INTEGER,icon INTEGER);
    CREATE TABLE enchants(id INTEGER,name TEXT,icon INTEGER);
    CREATE VIRTUAL TABLE items_fts USING fts5(name,content='items',content_rowid='id');`)
  db.prepare('INSERT INTO meta VALUES (?,?)').run('index_version',String(version))
  const add=(id:number,name:string,patch:{level?:number;inventory?:number;classId?:number;subclass?:number;stats?:string[];mask?:number;specIds?:number[]}={})=>{
    const values=[id,name,4,patch.level??300,90,patch.inventory??1,patch.classId??4,patch.subclass??4,null,12,1,0,'']
    if(version===2)values.push(patch.mask??-1,JSON.stringify(patch.specIds??[]),JSON.stringify(patch.stats??['strength']))
    db.prepare(`INSERT INTO items VALUES (${values.map(()=>'?').join(',')})`).run(...values)
    db.prepare('INSERT INTO items_fts(rowid,name) VALUES (?,?)').run(id,name)
  }
  const engine=new GameDataEngine(folder,{status:()=>{}});open.push(engine)
  return {db,add,engine,folder}
}

describe('local character-compatible item search',()=>{
  it('finds compatible items after a full rejected candidate page and filters before deduplication',async()=>{
    const {db,add,engine}=fixture()
    for(let id=1;id<=180;id++)add(id,id===1?'Shared name':`Rejected helm ${id}`,{level:1000-id,subclass:4,stats:['strength']})
    add(999,'Shared name',{level:300,subclass:1,stats:['intellect']})
    add(1000,'Mage helm',{level:299,subclass:1,stats:['intellect']})
    db.close();await engine.useInstall(install)
    expect(engine.search({slot:'head',character:{className:'Mage',specId:62,level:90},limit:2}).map(item=>item.id)).toEqual([999,1000])
  })
  it('supports Fury two-hand offhand searches and ordinary armor filtering with any slot',async()=>{
    const {db,add,engine}=fixture()
    add(1,'Greatsword',{inventory:17,classId:2,subclass:8})
    add(2,'Cloth helm',{subclass:1,stats:['intellect']})
    add(3,'Plate helm')
    db.close();await engine.useInstall(install)
    expect(engine.search({slot:'offHand',character:{className:'Warrior',specId:72,level:90}}).map(item=>item.id)).toEqual([1])
    expect(engine.search({slot:'offHand',character:{className:'Death Knight',specId:250,level:90}})).toHaveLength(0)
    expect(engine.search({armor:'cloth'}).map(item=>item.id)).toContain(2)
    expect(engine.search({armor:'cloth'}).map(item=>item.id)).not.toContain(3)
  })
  it('preserves explicit restrictions in returned summaries and broad browsing without a character',async()=>{
    const {db,add,engine}=fixture();add(1,'Restricted plate',{mask:32,specIds:[250]});db.close();await engine.useInstall(install)
    expect(engine.search({})[0]).toMatchObject({classId:4,subclassId:4,allowableClassMask:32,specIds:[250],primaryStats:['strength']})
    expect(engine.search({character:{className:'Paladin',specId:66,level:90}})).toHaveLength(0)
  })
  it('retains a legacy usable index and its partial metadata if an automatic rebuild fails',async()=>{
    const {db,add,engine}=fixture(1);add(1,'Legacy headpiece');db.close();await engine.useInstall(install)
    expect(engine.getStatus().state).toBe('not-indexed')
    const internals=engine as unknown as {openCasc:()=>Promise<never>};internals.openCasc=async()=>{throw new Error('Fixture archives unavailable')}
    await expect(engine.ensureIndex()).rejects.toThrow('Fixture archives unavailable')
    expect(engine.getStatus()).toMatchObject({state:'ready',itemCount:1,error:'Fixture archives unavailable'})
    expect(engine.search({})[0]).toMatchObject({id:1,allowableClassMask:null,specIds:null,primaryStats:null})
    const persisted=new Database(path.join((engine as unknown as {directory:string}).directory,`items-${install.build.version}.sqlite`),{readonly:true})
    expect(persisted.prepare('SELECT value FROM meta WHERE key = ?').get('index_version')).toEqual({value:'1'});persisted.close()
  })
  it('keeps a current index usable when a forced refresh fails',async()=>{
    const {db,add,engine}=fixture();add(1,'Existing headpiece');db.close();await engine.useInstall(install)
    const internals=engine as unknown as {openCasc:()=>Promise<never>};internals.openCasc=async()=>{throw new Error('Fixture refresh failed')}
    await expect(engine.ensureIndex(true)).rejects.toThrow('Fixture refresh failed')
    expect(engine.getStatus().state).toBe('ready');expect(engine.search({})[0]?.id).toBe(1)
  })
  it('closes and removes a partially built replacement without discarding the previous index',async()=>{
    const {db,add,engine,folder}=fixture();add(1,'Preserved headpiece');db.close();await engine.useInstall(install)
    const internals=engine as unknown as {openCasc:()=>Promise<unknown>;table:(casc:unknown,name:string)=>Promise<Map<number,Record<string,number|number[]>>>}
    internals.openCasc=async()=>({})
    internals.table=async(_casc,name)=>name==='ItemSparse'?new Map([[99,{ItemLevel:Number.NaN}]]):new Map()
    await expect(engine.ensureIndex(true)).rejects.toThrow('NOT NULL')
    expect(engine.search({})[0]?.name).toBe('Preserved headpiece')
    expect(readdirSync(folder).filter(name=>name.endsWith('.tmp'))).toEqual([])
  })
  it('rebuilds actual restriction columns while ignoring zeroed override tombstones',async()=>{
    const {db,engine}=fixture();db.close();await engine.useInstall(install)
    const internals=engine as unknown as {openCasc:()=>Promise<unknown>;table:(casc:unknown,name:string)=>Promise<Map<number,Row>>}
    internals.openCasc=async()=>({})
    internals.table=async(_casc,name)=>{
      if(name==='Item')return new Map([[5,{ClassID:4,SubclassID:1,InventoryType:1}]])
      if(name==='ItemSparse')return new Map([[5,{Display_lang:'Recorded mage helm',OverallQualityID:4,ItemLevel:300,RequiredLevel:90,ExpansionID:12,AllowableClass:-1,StatModifier_bonusStat:[5]}]])
      if(name==='ItemSpecOverride')return new Map([[1,{ItemID:0,SpecID:0}],[2,{ItemID:5,SpecID:62}]])
      return new Map()
    }
    await engine.ensureIndex(true)
    expect(engine.getStatus().state).toBe('ready')
    expect(engine.search({character:{className:'Mage',specId:62,level:90}})[0]).toMatchObject({id:5,allowableClassMask:-1,specIds:[62],primaryStats:['intellect']})
    expect(engine.search({character:{className:'Mage',specId:64,level:90}})).toHaveLength(0)
  })
})
