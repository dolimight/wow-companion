import { afterEach, describe, expect, it } from 'vite-plus/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseRepository } from './repository'
import Database from 'better-sqlite3'
import { parseSnapshot } from '../../main/imports/parse-snapshot'
import { parseRaiderIoProfile } from '../../main/providers/raiderio'
const folders: string[]=[]
const databases: DatabaseRepository[]=[]
function repo(path=':memory:') {const database=new DatabaseRepository(path);databases.push(database);return database}
function record(overrides:Record<string,unknown>={}) {return {guid:'Player-1-ABC',region:'us',realm:'Realm One',name:'Astra',className:'Mage',raceName:'Human',observedAt:'2026-10-14T10:00:00.000Z',sessionId:'session-1',sequence:1,itemLevel:250,gear:[],...overrides}}
function envelope(records:Record<string,unknown>={'Player-1-ABC':record()}) {return {schemaVersion:1,addonVersion:'0.1.0',sourceProfileId:'profile-a',exportedAt:'2026-10-14T12:00:00.000Z',characters:records}}
afterEach(()=>{for(const d of databases.splice(0)){try{d.close()}catch{}}for(const f of folders.splice(0))rmSync(f,{recursive:true,force:true})})
describe('durable character boundaries',()=>{
  it('loads and updates a legacy zero-specialization draft without losing or duplicating it',()=>{
    const folder=mkdtempSync(join(tmpdir(),'wow-legacy-spec-'));folders.push(folder);const file=join(folder,'companion.db');const db=repo(file)
    const c=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',specId:0})
    const draft={id:'legacy-plan',characterId:c.id,specId:null,activity:'mythicPlus' as const,rulesetId:'unknown',name:'Keep this draft',items:[],updatedAt:'2026-10-21T10:00:00.000Z'}
    db.saveGearDraft(draft);db.close()
    const raw=new Database(file)
    raw.prepare('UPDATE characters SET payload = ? WHERE id = ?').run(JSON.stringify({...c,specId:0}),c.id)
    raw.prepare('UPDATE gear_drafts SET key = ?, payload = ? WHERE character_id = ?').run(JSON.stringify([c.id,0,'mythicPlus','unknown']),JSON.stringify({...draft,specId:0}),c.id)
    raw.close()
    const reopened=repo(file)
    expect(reopened.getCharacter(c.id)?.specId).toBeNull()
    const restored=reopened.getGearDraft({characterId:c.id,specId:null,activity:'mythicPlus'})!
    expect(restored).toMatchObject({id:'legacy-plan',specId:null,name:'Keep this draft'})
    reopened.saveGearDraft({...restored,name:'Updated draft'})
    expect(reopened.exportBackup().drafts).toHaveLength(1)
    expect(reopened.getGearDraft({characterId:c.id,specId:0,activity:'mythicPlus'})?.name).toBe('Updated draft')
  })
  it('does not overwrite a known spec with a zero placeholder for the same specialization',()=>{
    const db=repo();const c=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',specId:250,specName:'Blood'})
    db.importSnapshot(envelope({'Player-1-ABC':record({specId:0,specName:'Blood'})}))
    expect(db.getCharacter(c.id)).toMatchObject({specId:250,specName:'Blood'})
  })
  it('keeps known gear and its source time when a newer logout snapshot is empty',()=>{
    const db=repo()
    const id=db.importSnapshot(envelope({'Player-1-ABC':record({gear:[{slot:'head',itemId:7,name:'Known headpiece',itemLevel:250}],gearCoverage:'complete'})})).imported[0]!
    const before=db.getCharacter(id)!
    const next=record({sequence:2,observedAt:'2026-10-15T10:00:00.000Z',itemLevel:0,gear:[],gearCoverage:'complete',talentLoadout:'New talents'})
    expect(db.importSnapshot(envelope({'Player-1-ABC':next})).imported).toEqual([id])
    expect(db.getCharacter(id)).toMatchObject({gear:before.gear,itemLevel:250,gearCoverage:'complete',gearSource:'addon',gearObservedAt:before.gearObservedAt,observedAt:next.observedAt,talents:{loadout:'New talents'}})
    expect(db.importSnapshot(envelope({'Player-1-ABC':next})).unchanged).toEqual([id])
  })
  it('preserves Blizzard gear when the first addon capture is empty and marks unknown new gear honestly',()=>{
    const db=repo()
    const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',itemLevel:296,gear:[{slot:'head',itemId:7,name:'Known headpiece'}],gearCoverage:'complete',gearSource:'Blizzard',gearObservedAt:'2026-10-14T09:00:00.000Z'})
    db.importSnapshot(envelope({'Player-1-ABC':record({itemLevel:0})}))
    expect(db.getCharacter(original.id)).toMatchObject({itemLevel:296,gearSource:'Blizzard',gearObservedAt:'2026-10-14T09:00:00.000Z'})
    const blank=repo();const id=blank.importSnapshot(envelope({'Player-1-ABC':record({itemLevel:0,gearCoverage:'complete'})})).imported[0]!
    expect(blank.getCharacter(id)).toMatchObject({itemLevel:null,gearCoverage:'unknown',gearSource:null,gearObservedAt:null})
  })
  it('keeps a known item level when item details have not been loaded yet',()=>{
    const db=repo();const id=db.importSnapshot(envelope()).imported[0]!
    db.importSnapshot(envelope({'Player-1-ABC':record({sequence:2,observedAt:'2026-10-15T10:00:00.000Z',itemLevel:0})}))
    expect(db.getCharacter(id)).toMatchObject({itemLevel:250,gearCoverage:'unknown',gearObservedAt:'2026-10-14T10:00:00.000Z'})
  })
  it('accepts a later populated snapshot after protecting known gear from an empty one',()=>{
    const db=repo();const id=db.importSnapshot(envelope({'Player-1-ABC':record({gear:[{slot:'head',name:'Old gear',itemLevel:250}]})})).imported[0]!
    db.importSnapshot(envelope({'Player-1-ABC':record({sequence:2,observedAt:'2026-10-15T10:00:00.000Z',itemLevel:0})}))
    const at='2026-10-16T10:00:00.000Z'
    db.importSnapshot(envelope({'Player-1-ABC':record({sequence:3,observedAt:at,itemLevel:275,gear:[{slot:'head',name:'New gear',itemLevel:275}],gearCoverage:'complete'})}))
    expect(db.getCharacter(id)).toMatchObject({gear:[{name:'New gear',itemLevel:275}],itemLevel:275,gearSource:'addon',gearObservedAt:at})
  })
  it('allows a public profile to recover empty gear written by an older addon importer',()=>{
    const db=repo();const broken=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',gear:[],itemLevel:0,gearCoverage:'complete',gearSource:'addon',gearObservedAt:'2026-10-16T10:00:00.000Z'})
    const fixed=db.applyBlizzardProfile(broken.id,{characterId:7,name:'Astra',realm:'Realm One',realmSlug:'realm-one',region:'us',level:90,itemLevel:296,className:'Mage',specName:'Frost',specId:64,raceName:'Human',raceId:1,sex:'female',observedAt:'2026-10-14T09:00:00.000Z',gear:[{slot:'head',itemId:7,name:'Recovered gear'}],observedTransmog:{},customization:[],renders:null,ratings:{mythicPlus:null,pvp:null}})
    expect(fixed).toMatchObject({itemLevel:296,gearSource:'Blizzard',gearObservedAt:'2026-10-14T09:00:00.000Z'})
    expect(fixed.gear).toHaveLength(1)
  })
  it('moves a duplicate character\'s drafts, outfits and selection without losing public gear',()=>{
    const db=repo();const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',gear:[{slot:'head',name:'Public headpiece'}],itemLevel:296,gearSource:'Blizzard',gearObservedAt:'2026-10-14T09:00:00.000Z'})
    const twin=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'Realm One',characterKey:'Player-1-ABC'}]})
    db.saveGearDraft({id:'moved-draft',characterId:twin.id,specId:64,activity:'mythicPlus',rulesetId:'unknown',name:'Keep my plan',items:[],updatedAt:'2026-10-14T10:00:00.000Z'})
    db.saveOutfit({id:'moved-outfit',characterId:twin.id,name:'Keep my outfit',slots:{},hiddenSlots:[],illusionIds:{},templateId:null,updatedAt:'2026-10-14T10:00:00.000Z'})
    db.setSettings({lastCharacterId:twin.id,characterActivities:{[twin.id]:'pvp'}})
    expect(db.importSnapshot(envelope({'Player-1-ABC':record({itemLevel:0})})).imported).toEqual([original.id])
    expect(db.getGearDraft({characterId:original.id,specId:64,activity:'mythicPlus'})?.name).toBe('Keep my plan')
    expect(db.listOutfits(original.id)[0]?.name).toBe('Keep my outfit')
    expect(db.getSettings()).toMatchObject({lastCharacterId:original.id,characterActivities:{[original.id]:'pvp'}})
    expect(db.getSettings().characterActivities[twin.id]).toBeUndefined()
    expect(db.getCharacter(original.id)?.itemLevel).toBe(296)
    expect(db.getCharacter(twin.id)).toBeNull()
    expect(db.resolveIdentity(twin.sourceRefs)).toEqual({kind:'matched',characterId:original.id})
  })
  it('keeps separate plans for identity review instead of overwriting either draft during a merge',()=>{
    const db=repo();const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One'})
    const twin=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'Realm One',characterKey:'Player-1-ABC'}]})
    for(const c of [original,twin]) db.saveGearDraft({id:c.id,characterId:c.id,specId:64,activity:'mythicPlus',rulesetId:'unknown',name:c.id,items:[],updatedAt:'2026-10-14T10:00:00.000Z'})
    const revision=db.revision
    expect(db.importSnapshot(envelope()).errors[0]?.reason).toContain('separate gear plans')
    expect(db.exportBackup().drafts.map(d=>d.name).sort()).toEqual([original.id,twin.id].sort())
    expect(db.listCharacters(true)).toHaveLength(2);expect(db.revision).toBe(revision)
  })
  it('preserves a duplicate\'s target, sex, transmog and each provider\'s newer weekly data',()=>{
    const db=repo();const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',weekly:{addon:null,raiderio:null,blizzard:{source:'Blizzard',observedAt:'2026-10-14T08:00:00.000Z',weekStart:'2026-10-13T15:00:00.000Z',vault:[],lockouts:[],runs:[]}}})
    const transmog={head:{itemId:42,modifiedAppearanceId:null,name:'Recorded transmog'}}
    const weekly={addon:null,raiderio:{source:'Raider.IO' as const,observedAt:'2026-10-14T09:00:00.000Z',weekStart:'2026-10-13T15:00:00.000Z',vault:[],lockouts:[],runs:[]},blizzard:{source:'Blizzard' as const,observedAt:'2026-10-14T09:00:00.000Z',weekStart:'2026-10-13T15:00:00.000Z',vault:[],lockouts:[],runs:[]}}
    db.addCharacter({name:'Astra',region:'us',realm:'Realm One',targetItemLevel:300,sex:'female',observedTransmog:transmog,observedTransmogAt:'2026-10-14T09:00:00.000Z',weekly,sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'Realm One',characterKey:'Player-1-ABC'}]})
    expect(db.importSnapshot(envelope()).imported).toEqual([original.id])
    expect(db.getCharacter(original.id)).toMatchObject({targetItemLevel:300,sex:'female',observedTransmog:transmog,observedTransmogAt:'2026-10-14T09:00:00.000Z',weekly})
  })
  it('checks stale GUID observations before joining a public identity',()=>{
    const db=repo();const id=db.importSnapshot(envelope()).imported[0]!
    const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One'})
    const revision=db.revision
    expect(db.importSnapshot(envelope({'Player-1-ABC':record({sequence:0,observedAt:'2026-10-13T10:00:00.000Z'})})).errors).toHaveLength(1)
    expect(db.getCharacter(id)).not.toBeNull();expect(db.getCharacter(original.id)).not.toBeNull();expect(db.revision).toBe(revision)
  })
  it('persists addon deletion across restarts while leaving another character and its plans untouched',()=>{
    const folder=mkdtempSync(join(tmpdir(),'wow-delete-'));folders.push(folder);const file=join(folder,'companion.db');const db=repo(file)
    const id=db.importSnapshot(envelope()).imported[0]!
    const other=db.addCharacter({name:'Other',region:'us',realm:'Realm One'})
    for(const characterId of [id,other.id]) {
      db.saveGearDraft({id:characterId,characterId,specId:null,activity:'mythicPlus',rulesetId:'unknown',name:'Plan',items:[],updatedAt:'2026-10-14T10:00:00.000Z'})
      db.saveOutfit({id:characterId,characterId,name:'Outfit',slots:{},hiddenSlots:[],illusionIds:{},templateId:null,updatedAt:'2026-10-14T10:00:00.000Z'})
    }
    db.setSettings({lastCharacterId:other.id,characterActivities:{[id]:'pvp',[other.id]:'raiding'}})
    db.deleteCharacter(id);db.close()
    const reopened=repo(file);expect(reopened.importSnapshot(envelope()).imported).toHaveLength(0)
    expect(reopened.listCharacters(true).map(c=>c.id)).toEqual([other.id])
    expect(reopened.exportBackup().drafts.map(d=>d.characterId)).toEqual([other.id])
    expect(reopened.exportBackup().outfits.map(o=>o.characterId)).toEqual([other.id])
    expect(reopened.getSettings()).toMatchObject({lastCharacterId:other.id,characterActivities:{[other.id]:'raiding'}})
    expect(reopened.getSettings().characterActivities[id]).toBeUndefined()
  })
  it('joins an addon export to the character that was added first and heals an earlier duplicate',()=>{
    const db=repo();const first=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',level:90})
    const imported=db.importSnapshot(envelope())
    expect(imported.imported).toEqual([first.id]);expect(db.listCharacters(true)).toHaveLength(1)
    expect(db.getCharacter(first.id)).toMatchObject({gearSource:'addon',itemLevel:250})
  })
  it('merges a twin created by an older version into the original character',()=>{
    const db=repo();const original=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',level:90})
    const twin=db.addCharacter({name:'Astra',region:'us',realm:'Realm One',sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'Realm One',characterKey:'Player-1-ABC'}]})
    expect(twin.id).not.toBe(original.id);expect(db.listCharacters(true)).toHaveLength(2)
    const report=db.importSnapshot(envelope())
    expect(report.imported).toEqual([original.id]);expect(db.listCharacters(true).map(c=>c.id)).toEqual([original.id])
    expect(db.getCharacter(original.id)?.sourceRefs.some(ref=>ref.provider==='addon')).toBe(true)
  })
  it('deletes a character with its plans and keeps an addon character from returning on the next sync',()=>{
    const db=repo();const id=db.importSnapshot(envelope()).imported[0]!
    db.saveGearDraft({id:'d1',characterId:id,specId:null,activity:'mythicPlus',rulesetId:'unknown',name:'Plan',items:[],updatedAt:'2026-10-15T10:00:00.000Z'})
    db.setSettings({lastCharacterId:id})
    expect(db.deleteCharacter(id)).toEqual({deleted:true})
    expect(db.getCharacter(id)).toBeNull();expect(db.listCharacters(true)).toHaveLength(0);expect(db.getSettings().lastCharacterId).toBeNull()
    expect(db.exportBackup().drafts).toHaveLength(0)
    const again=db.importSnapshot(envelope({'Player-1-ABC':record({sequence:5,observedAt:'2026-10-16T10:00:00.000Z'})}))
    expect(again.imported).toHaveLength(0);expect(db.listCharacters(true)).toHaveLength(0)
    expect(db.deleteCharacter(id)).toEqual({deleted:false})
  })
  it('stores the addon Great Vault for its reset week and keeps provider-only fields on re-import',()=>{
    const db=repo();const id=db.importSnapshot(envelope()).imported[0]!
    db.applyBlizzardProfile(id,{characterId:7,name:'Astra',realm:'Realm One',realmSlug:'realm-one',region:'us',level:90,itemLevel:null,className:'Mage',specName:'Frost',specId:64,raceName:'Human',raceId:1,sex:'female',observedAt:'2026-10-14T09:00:00.000Z',gear:[],observedTransmog:{},customization:[{optionId:1,choiceId:2}],renders:{main:'renders/a.png',inset:null,avatar:null,observedAt:null},ratings:{mythicPlus:null,pvp:null},stats:{primary:{name:'Intellect',value:900},stamina:1,health:1,crit:10,haste:20,mastery:30,versatility:5,source:'Blizzard',observedAt:'2026-10-14T09:00:00.000Z'}})
    const weekly={weeklyResetAt:'2026-10-20T15:00:10Z',vault:[{kind:'dungeon',index:1,threshold:1,progress:2,level:12},{kind:'raid',index:1,threshold:2,progress:1,level:15}],lockouts:[{name:'Raid',difficulty:'Heroic',killed:1,total:8,raid:true}],runs:[{dungeon:'A',level:12,timed:true}]}
    db.importSnapshot(envelope({'Player-1-ABC':record({sequence:2,observedAt:'2026-10-15T10:00:00.000Z',weekly,talentLoadout:'ABC'})}))
    const c=db.getCharacter(id)!
    expect(c.renders?.main).toBe('renders/a.png');expect(c.customization).toEqual([{optionId:1,choiceId:2}]);expect(c.stats?.crit).toBe(10)
    expect(c.weekly.addon?.weekStart).toBe('2026-10-13T15:00:00.000Z')
    expect(c.weekly.addon?.vault).toEqual([{kind:'dungeon',index:1,threshold:1,progress:2,reward:'Mythic +12'},{kind:'raid',index:1,threshold:2,progress:1,reward:null}])
    expect(c.talents).toMatchObject({loadout:'ABC',source:'In-game talents'})
  })
  it('persists bounded sidebar preferences across a SQLite reopen',()=>{const folder=mkdtempSync(join(tmpdir(),'wow-settings-'));folders.push(folder);const path=join(folder,'companion.db');const db=repo(path);expect(db.getSettings().sidebarWidth).toBe(240);db.setSettings({theme:'dark',sidebarWidth:320});expect(()=>db.setSettings({sidebarWidth:361})).toThrow();expect(db.getSettings().sidebarWidth).toBe(320);db.close();const restored=repo(path);expect(restored.getSettings()).toMatchObject({theme:'dark',sidebarWidth:320});restored.setSettings({sidebarWidth:240});expect(restored.getSettings().theme).toBe('dark')})
  it('keeps equal names on separate realms distinct and never invents a cap',()=>{const db=repo();const a=db.addCharacter({name:'Astra',region:'us',realm:'One'});const b=db.addCharacter({name:'Astra',region:'us',realm:'Two'});expect(a.id).not.toBe(b.id);expect(db.addCharacter({name:'Astra',region:'us',realm:'One'}).id).toBe(a.id);expect(a.maxItemLevel).toBeNull();expect(a.ratings.mythicPlus).toBeNull()})
  it('retains immutable identity after an observed rename with the same GUID',()=>{const db=repo();const id=db.importSnapshot(envelope()).imported[0]!;db.importSnapshot(envelope({'Player-1-ABC':record({name:'Renamed',realm:'Transferred',sequence:2,observedAt:'2026-10-14T11:00:00.000Z'})}));expect(db.listCharacters()).toHaveLength(1);expect(db.getCharacter(id)?.name).toBe('Renamed')})
  it('commits valid siblings while rejecting an invalid alt and deduplicates repeat exports',()=>{const db=repo();const input=envelope({'Player-1-ABC':record(),'invalid':{name:'Broken'}});const report=db.importSnapshot(input);expect(report.imported).toHaveLength(1);expect(report.errors).toHaveLength(1);const repeat=db.importSnapshot(input);expect(repeat.imported).toHaveLength(0);expect(repeat.unchanged).toEqual(report.imported);expect(repeat.revision).toBe(report.revision)})
  it('rejects regressed sequence and stale sessions without replacing current gear',()=>{const db=repo();const id=db.importSnapshot(envelope()).imported[0]!;expect(db.importSnapshot(envelope({'Player-1-ABC':record({sequence:0,itemLevel:280,observedAt:'2026-10-14T11:00:00.000Z'})})).errors).toHaveLength(1);expect(db.importSnapshot(envelope({'Player-1-ABC':record({sessionId:'old-session',sequence:500,itemLevel:290,observedAt:'2026-10-13T11:00:00.000Z'})})).errors).toHaveLength(1);expect(db.getCharacter(id)?.itemLevel).toBe(250);expect(db.importSnapshot(envelope({'Player-1-ABC':record({sessionId:'new-session',sequence:0,observedAt:'2026-10-14T12:00:00.000Z'})})).imported).toEqual([id])})
  it('isolates drafts by character, spec and activity across a SQLite reopen',()=>{const folder=mkdtempSync(join(tmpdir(),'wow-db-'));folders.push(folder);const path=join(folder,'companion.db');const db=repo(path);const a=db.addCharacter({name:'A',region:'us',realm:'One'});const b=db.addCharacter({name:'B',region:'us',realm:'One'});const base={id:'draft-a',characterId:a.id,specId:64,activity:'mythicPlus' as const,rulesetId:'unknown',name:'A gear',items:[],updatedAt:'2026-10-14T12:00:00.000Z'};db.saveGearDraft(base);db.saveGearDraft({...base,id:'draft-b',characterId:b.id,name:'B gear'});db.archiveCharacter(a.id);db.close();const restored=repo(path);expect(restored.listCharacters()).toHaveLength(1);expect(restored.getGearDraft({characterId:a.id,specId:64,activity:'mythicPlus'})?.name).toBe('A gear');expect(restored.getGearDraft({characterId:b.id,specId:64,activity:'mythicPlus'})?.name).toBe('B gear');expect(restored.getGearDraft({characterId:a.id,specId:64,activity:'pvp'})).toBeNull();restored.restoreCharacter(a.id);expect(restored.listCharacters()).toHaveLength(2)})
  it('does not infer missing appearances from unknown or partial coverage',()=>{const db=repo();const id=db.importSnapshot(envelope({'Player-1-ABC':record({collectionScopeId:'scope-a',collectionCoverage:'partial',collectedAppearanceIds:[42]})})).imported[0]!;expect(db.getCollectionStatus(id,42)).toBe('collected');expect(db.getCollectionStatus(id,43)).toBe('unknown')})
  it('validates backup references and rolls back a conflicting identity',()=>{const db=repo();const a=db.addCharacter({name:'A',region:'us',realm:'One'});const backup=db.exportBackup();expect(()=>db.importBackup({...backup,drafts:[{id:'orphan'}]})).toThrow();const conflicting={...a,id:'other-id'};expect(()=>db.importBackup({...backup,characters:[a,conflicting]})).toThrow();expect(db.listCharacters()).toHaveLength(1);expect(repo().importBackup(backup).characters).toBe(1)})
  it('does not commit a partially written file',()=>{const db=repo();db.importSnapshot(envelope());expect(()=>db.importSnapshot(parseSnapshot('WoWCompanionDB = { ["schemaVersion"] = 1,'))).toThrow();expect(db.listCharacters()).toHaveLength(1)})
  it('keeps independent partial outfits and provider ratings without changing gear timestamps',()=>{const db=repo();const id=db.importSnapshot(envelope()).imported[0]!;const before=db.getCharacter(id)!;db.saveOutfit({id:'outfit-1',characterId:id,name:'A look',slots:{shoulderLeft:{appearanceId:12,modifiedAppearanceId:null,itemId:null,variantKey:'left',source:'manual'}},hiddenSlots:['back'],illusionIds:{},templateId:null,updatedAt:'2026-10-14T11:00:00.000Z'});expect(db.listOutfits(id)[0]?.slots.shoulderLeft?.appearanceId).toBe(12);const rating={value:2500,label:'Mythic+ score',rank:100,population:null,seasonId:'season-test',observedAt:'2026-10-14T12:00:00.000Z',source:'Raider.IO',sourceUrl:'https://raider.io/characters/us/one/astra',rankScope:'World · overall'};db.applyProviderRatings(id,{mythicPlus:rating});db.applyProviderRatings(id,{mythicPlus:{...rating,value:1000,observedAt:'2026-10-13T12:00:00.000Z'}});expect(db.getCharacter(id)?.ratings.mythicPlus?.value).toBe(2500);expect(db.getCharacter(id)?.observedAt).toBe(before.observedAt);expect(db.getCharacter(id)?.importedAt).toBe(before.importedAt)})
  it('fills unknown public gear with source time and never replaces authoritative addon gear',()=>{const db=repo();const addonId=db.importSnapshot(envelope({'Player-1-ABC':record({gear:[{slot:'head',itemId:7,name:'Addon head',itemLevel:250}]})})).imported[0]!;const addonBefore=db.getCharacter(addonId)!;const profile=parseRaiderIoProfile({name:'Astra',realm:'Realm One',region:'us',class:'Mage',race:'Human',active_spec_name:'Frost',profile_url:'https://raider.io/characters/us/realm-one/astra',last_crawled_at:'2026-10-14T11:00:00Z',gear:{item_level_equipped:270,items:{head:{item_id:88,item_level:270}}},mythic_plus_scores_by_season:[{season:'test',scores:{all:2000}}]});const preserved=db.applyProviderProfile(addonId,profile);expect(preserved.gear[0]?.itemId).toBe(7);expect(preserved.itemLevel).toBe(250);expect(preserved.gearSource).toBe('addon');expect(preserved.observedAt).toBe(addonBefore.observedAt);expect(preserved.importedAt).toBe(addonBefore.importedAt);expect(preserved.ratings.mythicPlus?.value).toBe(2000);const manual=db.addCharacter({name:'Astra',realm:'Realm One',region:'us',gearCoverage:'unknown'});const filled=db.applyProviderProfile(manual.id,profile);expect(filled.gear[0]?.itemId).toBe(88);expect(filled.gearSource).toBe('Raider.IO');expect(filled.gearObservedAt).toBe('2026-10-14T11:00:00.000Z');expect(filled.observedAt).toBe('2026-10-14T11:00:00.000Z');expect(filled.specName).toBe('Frost')})
  it('keeps absent provider observation dates unknown and rejects another identity',()=>{const db=repo();const manual=db.addCharacter({name:'Astra',realm:'Realm One',region:'us'});const profile=parseRaiderIoProfile({name:'Astra',realm:'Realm One',region:'us',class:'Mage',race:'Human',profile_url:'https://raider.io/characters/us/realm-one/astra',gear:{item_level_equipped:270,items:{head:{item_id:88,item_level:270}}}});const filled=db.applyProviderProfile(manual.id,profile);expect(filled.observedAt).toBeNull();expect(filled.gearObservedAt).toBeNull();expect(()=>db.applyProviderProfile(manual.id,{...profile,character:{...profile.character,realm:'Other Realm'}})).toThrow('does not match')})
})
