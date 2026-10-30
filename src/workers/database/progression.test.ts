import { afterEach,describe,expect,it } from 'vite-plus/test'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseRepository } from './repository'
const dbs:DatabaseRepository[]=[],folders:string[]=[]
const open=(file=':memory:')=>{const db=new DatabaseRepository(file);dbs.push(db);return db}
afterEach(()=>{for(const db of dbs.splice(0))try{db.close()}catch{};for(const folder of folders.splice(0))rmSync(folder,{force:true,recursive:true})})
const preferences={activities:['mythicPlus' as const],difficulties:['mythic'],allowCrafting:false,excludedMethods:['vault']}
describe('progression persistence boundaries',()=>{
  it('preserves character/activity isolation and preferences across reopen and backup',()=>{
    const folder=mkdtempSync(join(tmpdir(),'wow-progression-'));folders.push(folder);const file=join(folder,'companion.sqlite');const db=open(file)
    const a=db.addCharacter({name:'A',region:'us',realm:'One'}),b=db.addCharacter({name:'B',region:'us',realm:'One'})
    db.setContentPreferences(a.id,'mythicPlus',preferences)
    expect(db.getContentPreferences(a.id,'raiding').allowCrafting).toBe(true)
    expect(db.getContentPreferences(b.id,'mythicPlus').allowCrafting).toBe(true)
    db.close();const reopened=open(file);expect(reopened.getContentPreferences(a.id,'mythicPlus')).toEqual(preferences)
    const backup=reopened.exportBackup();const restored=open();restored.importBackup(backup)
    expect(restored.getContentPreferences(a.id,'mythicPlus')).toEqual(preferences)
    reopened.deleteCharacter(a.id)
    expect(reopened.exportBackup().contentPreferences).toHaveLength(0)
    expect(reopened.getCharacter(b.id)).not.toBeNull()
  })
  it('reads legacy backups and rejects orphaned preference writes atomically',()=>{
    const db=open();db.addCharacter({name:'A',region:'us',realm:'One'})
    const {contentPreferences:_,...legacy}=db.exportBackup()
    const restored=open();restored.importBackup(legacy)
    const before=restored.exportBackup()
    expect(()=>restored.importBackup({...legacy,contentPreferences:[{characterId:'missing',activity:'mythicPlus',preferences}]})).toThrow('orphaned')
    expect(restored.exportBackup().characters).toEqual(before.characters)
  })
  it('retains imported progression metadata through JSON persistence and incomplete subsequent captures',()=>{
    const db=open();const now='2026-10-27T10:00:00Z'
    const record={guid:'Player-test',region:'us',realm:'One',name:'A',className:'Death Knight',raceName:'Human',observedAt:now,sessionId:'one',sequence:1,gear:[{slot:'mainHand',itemId:42,name:'Weapon',itemLevel:100,inventoryType:17,bonusIds:[123,456],upgradeTrackId:'observed',upgradeRank:1}],progressionResources:{currencies:{crests:10},observedAt:now}}
    const envelope={schemaVersion:1,addonVersion:'0.2.2',sourceProfileId:'fixture',exportedAt:now,characters:{'Player-test':record}}
    const id=db.importSnapshot(envelope).imported[0]!
    expect(db.getCharacter(id)?.gear[0]).toMatchObject({inventoryType:17,bonusIds:[123,456],upgradeTrackId:'observed',upgradeRank:1})
    db.importSnapshot({...envelope,characters:{'Player-test':{...record,observedAt:'2026-10-27T11:00:00Z',sequence:2,gear:[],progressionResources:undefined}}})
    expect(db.getCharacter(id)?.progressionResources?.currencies).toEqual({crests:10})
    expect(db.getCharacter(id)?.gear[0]?.bonusIds).toEqual([123,456])
  })
})
