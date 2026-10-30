import { z } from 'zod'
import { activitySchema, gearItemSchema, gearSlotSchema, specializationIdSchema, type Activity, type Character, type GearItem } from './domain'
import { evidenceRefSchema, type EvidenceRef } from './evidence'

export const currencyCostSchema=z.object({currencyId:z.string().min(1),amount:z.number().int().nonnegative()})
export type CurrencyCost=z.infer<typeof currencyCostSchema>
export const acquisitionSourceSchema=z.object({activity:z.enum([...activitySchema.options,'crafting','world']),difficulty:z.string().nullable(),method:z.string(),name:z.string(),url:z.string().url().nullable()})
export type AcquisitionSource=z.infer<typeof acquisitionSourceSchema>
export const itemVariantSchema=gearItemSchema.extend({
  variantKey:z.string().min(1),instanceId:z.string().nullable().default(null),inventoryType:z.number().int().nonnegative().nullable().default(null),requiredLevel:z.number().int().nonnegative().nullable().default(null),
  classId:z.number().int().nonnegative().nullable().optional(),subclassId:z.number().int().nonnegative().nullable().optional(),allowableClassMask:z.number().int().nullable().optional(),specIds:z.array(z.number().int().positive()).nullable().optional(),primaryStats:z.array(z.enum(['strength','agility','intellect'])).nullable().optional(),
  bonusIds:z.array(z.number().int()).nullable().default(null),upgradeTrackId:z.string().nullable().default(null),upgradeRank:z.number().int().positive().nullable().default(null),
  uniqueGroups:z.array(z.string()).default([]),restrictionGroups:z.array(z.string()).default([]),source:acquisitionSourceSchema.nullable().default(null),availableFrom:z.string().datetime().nullable().default(null),availableUntil:z.string().datetime().nullable().default(null),
  owned:z.boolean().default(false),evidenceRefs:z.array(evidenceRefSchema).default([]),observedAt:z.string().datetime().nullable().default(null),coverage:z.enum(['complete','partial','unknown']).default('unknown'),currencyCost:z.array(currencyCostSchema).nullable().default(null),
})
export type ItemVariant=z.infer<typeof itemVariantSchema>
export const inventorySnapshotSchema=z.object({schemaVersion:z.literal(1).default(1),characterId:z.string(),items:z.array(itemVariantSchema).default([]),currencies:z.record(z.string(),z.number().int().nonnegative()).nullable().default(null),highWaterMarks:z.partialRecord(gearSlotSchema,z.number().nonnegative()).nullable().default(null),discountCoverage:z.enum(['complete','unknown']).default('unknown'),coverage:z.enum(['complete','partial','unknown']).default('unknown'),observedAt:z.string().datetime().nullable().default(null),evidenceRefs:z.array(evidenceRefSchema).default([])})
export type InventorySnapshot=z.infer<typeof inventorySnapshotSchema>
export const gearBaselineSchema=z.object({schemaVersion:z.literal(1).default(1),characterId:z.string(),className:z.string(),specId:specializationIdSchema,level:z.number().int().nonnegative().nullable(),items:z.array(itemVariantSchema),equippedItemLevel:z.number().nonnegative().nullable(),weaponConfiguration:z.enum(['twoHand','dual','unknown']).default('unknown'),gameBuild:z.string().nullable(),observedAt:z.string().datetime().nullable(),evidenceRefs:z.array(evidenceRefSchema).default([])})
export type GearBaseline=z.infer<typeof gearBaselineSchema>

/** Opaque item-link fields remain intact; this key never claims missing variant fields are exact */
export function toItemVariant(gear:GearItem,overrides:Partial<ItemVariant>={}):ItemVariant {
  const raw=gear as GearItem&Partial<ItemVariant>
  const variantKey=overrides.variantKey??raw.variantKey??JSON.stringify([gear.slot,gear.itemId,gear.itemLink,gear.itemLevel,gear.enchant,gear.gems,raw.upgradeTrackId??null,raw.upgradeRank??null,raw.bonusIds??null])
  const variantCoverage=(raw as GearItem&{variantCoverage?:ItemVariant['coverage']}).variantCoverage
  return itemVariantSchema.parse({...raw,variantKey,coverage:variantCoverage??raw.coverage??(raw.itemLink?'partial':'unknown'),...overrides})
}
export function baselineFromCharacter(character:Character):GearBaseline {
  const items=character.gear.map(item=>toItemVariant(item,{owned:true,observedAt:character.gearObservedAt}))
  const main=items.find(item=>item.slot==='mainHand')
  const off=items.find(item=>item.slot==='offHand')
  const weaponConfiguration=main?.inventoryType!=null&&[15,17,26].includes(main.inventoryType)&&!off?'twoHand':main&&off?'dual':'unknown'
  return gearBaselineSchema.parse({schemaVersion:1,characterId:character.id,className:character.className,specId:character.specId,level:character.level,items,equippedItemLevel:character.itemLevel,weaponConfiguration,gameBuild:character.gameBuild,observedAt:character.gearObservedAt,evidenceRefs:[]})
}
export function combineEvidence(...groups:EvidenceRef[][]):EvidenceRef[]{return [...new Map(groups.flat().map(ref=>[`${ref.id}:${ref.contentHash}`,ref])).values()]}
