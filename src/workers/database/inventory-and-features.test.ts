import { afterEach,describe,expect,it } from 'vite-plus/test'
import { DatabaseRepository } from './repository'
const databases:DatabaseRepository[]=[]
const open=()=>{const db=new DatabaseRepository(':memory:');databases.push(db);return db}
afterEach(()=>{for(const db of databases.splice(0))db.close()})
const at='2026-10-29T12:00:00Z'
const record=(extra:Record<string,unknown>={})=>({guid:'Player-fixture',region:'us',realm:'One',name:'A',className:'Mage',raceName:'Human',observedAt:at,sessionId:'one',sequence:1,gear:[{slot:'head',itemId:42,name:'Helm',itemLevel:100}],...extra})
const envelope=(value:unknown)=>({schemaVersion:1,addonVersion:'0.3.0',sourceProfileId:'fixture',exportedAt:at,characters:{'Player-fixture':value}})
const bank={location:'bank',coverage:'complete',observedAt:at,items:[{slot:'finger1',itemId:43,name:'Ring',bonusIds:[123],instanceId:'item-guid-1',locationKey:'bank:6:1'}]}
describe('inventory and feature persistence',()=>{
  it('retains exact observed bank inventory across unavailable and legacy captures',()=>{
    const db=open(),id=db.importSnapshot(envelope(record({inventoryObservations:[bank]}))).imported[0]!
    db.importSnapshot(envelope(record({sequence:2,observedAt:'2026-10-29T13:00:00Z',inventoryObservations:[{location:'bank',coverage:'unknown',items:[]}]})))
    expect(db.getCharacter(id)?.inventoryObservations?.[0]).toMatchObject({...bank,items:[expect.objectContaining({bonusIds:[123],instanceId:'item-guid-1'})]})
    db.importSnapshot(envelope(record({sequence:3,observedAt:'2026-10-29T14:00:00Z'})))
    expect(db.getCharacter(id)?.inventoryObservations?.[0]?.observedAt).toBe(at)
    const restored=open();restored.importBackup(db.exportBackup())
    expect(restored.getCharacter(id)?.inventoryObservations).toEqual(db.getCharacter(id)?.inventoryObservations)
  })
  it('keeps duplicates and mutually exclusive unowned Vault alternatives distinct',()=>{
    const db=open(),vault={location:'vault',coverage:'partial',observedAt:at,choiceGroup:'us:reset-1',items:[{slot:'finger1',itemId:43,name:'Ring',instanceId:'choice-1',vaultChoiceGroup:'us:reset-1'},{slot:'finger1',itemId:43,name:'Ring',instanceId:'choice-2',vaultChoiceGroup:'us:reset-1'}]}
    const id=db.importSnapshot(envelope(record({inventoryObservations:[vault]}))).imported[0]!
    expect(db.getCharacter(id)?.inventoryObservations?.[0]?.items.map(i=>i.instanceId)).toEqual(['choice-1','choice-2'])
    expect(db.getCharacter(id)?.gear).toHaveLength(1)
  })
  it('isolates feature namespaces and characters, backs up JSON, and cascades deletion',()=>{
    const db=open(),a=db.addCharacter({name:'A',realm:'One',region:'us'}),b=db.addCharacter({name:'B',realm:'One',region:'us'})
    const before=db.getRevision();db.saveFeatureState(a.id,'tonight',{pins:['one'],goal:'gear'})
    expect(db.getRevision()).toBeGreaterThan(before)
    expect(db.getFeatureState(b.id,'tonight')).toBeNull()
    expect(db.getFeatureState(a.id,'simulation')).toBeNull()
    const restored=open();restored.importBackup(db.exportBackup())
    expect(restored.getFeatureState(a.id,'tonight')).toEqual({pins:['one'],goal:'gear'})
    restored.deleteCharacter(a.id)
    expect(restored.exportBackup().featureStates).toHaveLength(0)
    expect(()=>restored.saveFeatureState(a.id,'tonight',{})).toThrow('not found')
  })
  it('rejects malformed and oversized states before changing the revision',()=>{
    const db=open(),a=db.addCharacter({name:'A',realm:'One',region:'us'}),before=db.getRevision()
    expect(()=>db.saveFeatureState(a.id,'../bad',{})).toThrow()
    expect(()=>db.saveFeatureState(a.id,'tonight',{bad:undefined})).toThrow('JSON')
    expect(()=>db.saveFeatureState(a.id,'tonight',{bad:NaN})).toThrow('JSON')
    expect(()=>db.saveFeatureState(a.id,'tonight','x'.repeat(1024*1024))).toThrow('1 MiB')
    expect(db.getRevision()).toBe(before)
  })
  it('reads old backups and rejects orphan/duplicate feature documents atomically',()=>{
    const db=open(),a=db.addCharacter({name:'A',realm:'One',region:'us'}),backup=db.exportBackup(),before=db.getRevision()
    const state={characterId:a.id,namespace:'tonight',value:{pins:[]}}
    expect(()=>db.importBackup({...backup,featureStates:[state,state]})).toThrow('duplicate')
    expect(()=>db.importBackup({...backup,featureStates:[{...state,characterId:'missing'}]})).toThrow('orphaned')
    expect(db.getRevision()).toBe(before)
    const {featureStates:_,...legacy}=backup;open().importBackup(legacy)
  })
  it('moves nonconflicting feature history when healing an old addon duplicate',()=>{
    const db=open(),first=db.addCharacter({name:'A',realm:'One',region:'us'})
    const duplicate=db.addCharacter({name:'A',realm:'One',region:'us',sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'One',characterKey:'Player-fixture'}]})
    db.saveFeatureState(duplicate.id,'tonight',{pins:['upgrade-head']})
    expect(db.importSnapshot(envelope(record())).imported).toEqual([first.id])
    expect(db.getFeatureState(first.id,'tonight')).toEqual({pins:['upgrade-head']})
    expect(db.getCharacter(duplicate.id)).toBeNull()
  })
  it('requires identity review before conflicting feature history can be discarded',()=>{
    const db=open(),first=db.addCharacter({name:'A',realm:'One',region:'us'})
    const duplicate=db.addCharacter({name:'A',realm:'One',region:'us',sourceRefs:[{provider:'addon',edition:'retail',region:'us',realmId:'One',characterKey:'Player-fixture'}]})
    db.saveFeatureState(first.id,'tonight',{pins:['one']});db.saveFeatureState(duplicate.id,'tonight',{pins:['two']})
    const revision=db.getRevision()
    expect(db.importSnapshot(envelope(record())).errors[0]?.reason).toContain('feature history')
    expect(db.getRevision()).toBe(revision)
    expect(db.getFeatureState(first.id,'tonight')).toEqual({pins:['one']})
    expect(db.getFeatureState(duplicate.id,'tonight')).toEqual({pins:['two']})
  })
  it('retains a vendor quote only for its exact observed raw variant and keeps its timestamp',()=>{
    const db=open(),quote={observedAt:at,gameBuild:'12.1.5.70575',currentRank:1,maxRank:2,minItemLevel:100,maxItemLevel:104,upgradeable:true,levels:[{rank:2,itemLevelIncrement:4,currencies:[{currencyId:'999',amount:10}],items:[],moneyCost:100,failureMessage:null}]}
    const gear=[{slot:'head',itemId:42,name:'Helm',itemLevel:100,itemLink:'item:42:0:0:0:0:0:0:0:90:62:0:16:1:123',observedUpgrade:quote}]
    const id=db.importSnapshot(envelope(record({gear}))).imported[0]!
    const newer=record({sequence:2,observedAt:'2026-10-29T13:00:00Z',gear:[{...gear[0],observedUpgrade:undefined}]})
    db.importSnapshot(envelope(newer))
    expect(db.getCharacter(id)?.gear[0]?.observedUpgrade).toEqual(quote)
    db.importSnapshot(envelope({...newer,sequence:3,observedAt:'2026-10-29T14:00:00Z',gear:[{...gear[0],itemLink:'item:42:0:0:0:0:0:0:0:90:62:0:16:1:456',observedUpgrade:undefined}]}))
    expect(db.getCharacter(id)?.gear[0]?.observedUpgrade).toBeUndefined()
  })
})
