import { describe,expect,it } from 'vite-plus/test'
import { parseSnapshot } from './parse-snapshot'
describe('data-only SavedVariables parsing',()=>{
  it('normalizes inventory and quote arrays without turning balances into arrays',()=>{expect(parseSnapshot('WoWCompanionDB = { inventoryObservations = { { location="bags", items={ { bonusIds={},gemIds={}, observedUpgrade={ levels={ {currencies={},items={}} } } } } } }, progressionResources={currencies={money=5}} }')).toEqual({inventoryObservations:[{location:'bags',items:[{bonusIds:[],gemIds:[],observedUpgrade:{levels:[{currencies:[],items:[]}]}}]}],progressionResources:{currencies:{money:5}}})})
  it('reads keyed tables, escaped names and numeric arrays',()=>{expect(parseSnapshot('WoWCompanionDB = { ["schemaVersion"]=1, ["characters"]={ ["Player-1"]={ name="Astra\\nMage", gear={ [1]={ slot="head", gems={} } }, customization={} } } }')).toEqual({schemaVersion:1,characters:{'Player-1':{name:'Astra\nMage',gear:[{slot:'head',gems:[]}],customization:[]}}})})
  it('reads the addon preference table without treating it as a character',()=>{expect(parseSnapshot('WoWCompanionDB = { ["schemaVersion"]=1, ["settings"]={ ["mountPreview"]=false }, ["characters"]={} }')).toEqual({schemaVersion:1,settings:{mountPreview:false},characters:{}})})
  it('rejects executable Lua and prototype keys',()=>{for(const lua of ['WoWCompanionDB = os.execute("bad")','WoWCompanionDB = {}; print("bad")','WoWCompanionDB = { ["__proto__"] = {} }','WoWCompanionDB = { x = function() end }'])expect(()=>parseSnapshot(lua)).toThrow()})
  it('accepts manual JSON and rejects duplicate SavedVariables keys',()=>{expect(parseSnapshot('{"schemaVersion":1}')).toEqual({schemaVersion:1});expect(()=>parseSnapshot('WoWCompanionDB = { x=1,x=2 }')).toThrow()})
})
