import {afterEach,describe,it,expect} from 'vite-plus/test'
import {DatabaseRepository} from '../../workers/database/repository'
import type {DatabaseClient} from '../database'
import type {ProgressionService} from '../progression/service'
import {createSessionService} from './service'
import {gearItemSchema} from '../../shared/domain'
const opened:DatabaseRepository[]=[]
afterEach(()=>opened.splice(0).forEach(db=>db.close()))
function setup(){
  const db=new DatabaseRepository(':memory:');opened.push(db)
  const at='2026-10-29T12:00:00.000Z'
  const character=db.addCharacter({name:'Planner',region:'us',realm:'Fixture',className:'Mage',specId:64,gearObservedAt:at,gear:[{slot:'head',itemId:100,name:'Owned helm',itemLevel:300}]})
  const alt=db.addCharacter({name:'Other',region:'us',realm:'Fixture'})
  db.saveGearDraft({id:'goal',characterId:character.id,specId:64,activity:'mythicPlus',rulesetId:'unknown',name:'Goal',items:[gearItemSchema.parse({slot:'head',itemId:200,name:'Desired helm',itemLevel:310})],updatedAt:at})
  const bridge={call:async(method:keyof DatabaseRepository,...args:unknown[])=>(db[method]as(...args:unknown[])=>unknown).apply(db,args)}as Pick<DatabaseClient,'call'>
  const progression={evaluate:async()=>{throw Error('Rules unavailable')}}as unknown as ProgressionService
  return {db,character,alt,service:createSessionService({db:bridge,progression,now:()=>new Date(at)})}
}
describe('Tonight persistence and observations',()=>{
  it('works offline from saved goals and persists scheduling, pin, snooze and undo',async()=>{
    const {character,service}=setup(),first=await service.workspace(character.id)
    expect(first.plan.recommended).toBeNull();const goal=first.plan.unscheduled[0]!
    expect(goal.title).toContain('Desired helm')
    await service.duration(character.id,goal.key,15)
    await service.disposition(character.id,{key:goal.key,kind:'pin'})
    expect((await service.workspace(character.id)).plan.recommended?.key).toBe(goal.key)
    await service.disposition(character.id,{key:goal.key,kind:'snooze',until:'2026-10-30T12:00:00.000Z'})
    expect((await service.workspace(character.id)).plan.recommended).toBeNull()
    await service.undo(character.id,goal.key)
    expect((await service.workspace(character.id)).plan.recommended?.key).toBe(goal.key)
  })
  it('isolates alt state and refuses foreign roster references or deleted anchors',async()=>{
    const {db,character,alt,service}=setup()
    await service.preferences(character.id,{characterIds:[character.id],goal:'weekly',budgetMinutes:20})
    expect((await service.workspace(alt.id)).state.preferences.goal).toBe('gear')
    await expect(service.preferences(alt.id,{characterIds:['missing']})).rejects.toThrow('roster')
    db.deleteCharacter(character.id)
    await expect(service.workspace(character.id)).rejects.toThrow()
  })
  it('records duration evidence without marking uncertain game goals complete',async()=>{
    const {character,service}=setup(),first=await service.workspace(character.id),goal=first.plan.unscheduled[0]!
    await service.duration(character.id,goal.key,17,true)
    const workspace=await service.workspace(character.id)
    expect(workspace.plan.recommended?.duration).toEqual({min:17,max:17,source:'observed',samples:1})
    expect(workspace.state.history).toHaveLength(1)
    expect(workspace.plan.recommended?.kind).toBe('plan')
  })
})
