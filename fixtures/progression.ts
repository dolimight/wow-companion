import { gearSlotsForInventoryType } from '../src/shared/gamedata'
import { gearSlotSchema, gearItemSchema } from '../src/shared/domain'
import { toItemVariant, inventorySnapshotSchema, gearBaselineSchema, type ItemVariant } from '../src/shared/gear-variants'
import { seasonRulesetSchema, defaultContentPreferences } from '../src/shared/season-rules'
import type { EvaluationContext } from '../src/shared/evidence'

export const progressionContext:EvaluationContext={now:'2026-10-27T12:00:00.000Z',gameBuild:'12.1.5.70448',seasonId:'fixture-season',rulesetId:null,region:'us'}
export function progressionRules(){return seasonRulesetSchema.parse({schemaVersion:1,id:'fixture-rules',name:'Synthetic rules — not live game data',seasonId:'fixture-season',builds:{min:'12.1.5.70448',max:'12.1.5.70448'},regions:['us'],effectiveFrom:'2026-10-01T00:00:00.000Z',effectiveUntil:null,status:'active',validated:true,sources:[{title:'Synthetic fixture source',url:'https://example.com/fixture',checkedAt:'2026-10-01T00:00:00.000Z'}],validationFixtures:['synthetic-full-set'],candidateCoverage:'complete',constraintsCoverage:'complete',upgradeTracks:[{id:'fixture-track',name:'Synthetic track',ranks:[{rank:1,itemLevel:100,cost:[]},{rank:2,itemLevel:110,cost:[{currencyId:'crests',amount:10}]},{rank:3,itemLevel:120,cost:[{currencyId:'crests',amount:10}]}]}]})}
const armorTypes:Record<string,number>={head:1,neck:2,shoulder:3,back:16,chest:5,wrist:9,hands:10,waist:6,legs:7,feet:8,finger1:11,finger2:11,trinket1:12,trinket2:12,mainHand:17,offHand:22}
const plateSlots=new Set(['head','shoulder','chest','wrist','hands','waist','legs','feet'])
export function progressionItem(slot:ItemVariant['slot'],level=100,overrides:Partial<ItemVariant>={}):ItemVariant {
  const id=1000+gearSlotSchema.options.indexOf(slot)
  const base=gearItemSchema.parse({slot,itemId:id,name:`Fixture ${slot}`,itemLevel:level})
  return toItemVariant(base,{variantKey:`fixture-${slot}-${level}`,instanceId:`fixture-instance-${slot}`,inventoryType:armorTypes[slot],requiredLevel:1,classId:slot==='mainHand'||slot==='offHand'?2:4,subclassId:slot==='mainHand'?8:slot==='offHand'?7:plateSlots.has(slot)?4:0,allowableClassMask:-1,specIds:[],primaryStats:['strength'],owned:true,coverage:'complete',currencyCost:[],observedAt:'2026-10-27T10:00:00.000Z',...overrides})
}
export function progressionInput(){
  const items=gearSlotSchema.options.filter(slot=>slot!=='offHand').map(slot=>progressionItem(slot))
  const baseline=gearBaselineSchema.parse({schemaVersion:1,characterId:'fixture-character',className:'Death Knight',specId:250,level:90,items,equippedItemLevel:100,weaponConfiguration:'twoHand',gameBuild:progressionContext.gameBuild,observedAt:'2026-10-27T10:00:00.000Z'})
  const inventory=inventorySnapshotSchema.parse({characterId:baseline.characterId,items:[],currencies:{crests:20},highWaterMarks:{},discountCoverage:'complete',coverage:'complete'})
  return {baseline,inventory,candidates:[] as ItemVariant[],ruleset:progressionRules(),preferences:defaultContentPreferences(),context:progressionContext}
}
