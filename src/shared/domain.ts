import { z } from 'zod'
import { weeklySchema } from './weekly'

export const activitySchema = z.enum(['mythicPlus', 'raiding', 'pvp'])
export type Activity = z.infer<typeof activitySchema>
// Some observations use zero for an unavailable specialization; it is never a real spec ID
export const specializationIdSchema = z.number().int().nonnegative().nullable().transform(value => value === 0 ? null : value)
export const gearSlotSchema = z.enum(['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainHand', 'offHand'])
export type GearSlot = z.infer<typeof gearSlotSchema>
export const appearanceSlotSchema = z.enum([...gearSlotSchema.options, 'shoulderLeft', 'shoulderRight', 'shirt', 'tabard'])
export type AppearanceSlot = z.infer<typeof appearanceSlotSchema>
export const progressionResourcesSchema = z.object({
  currencies:z.record(z.string().min(1).max(80),z.number().int().nonnegative()).nullable().default(null),
  highWaterMarks:z.partialRecord(gearSlotSchema,z.number().nonnegative()).nullable().default(null),
  discountCoverage:z.enum(['complete','unknown']).default('unknown'),
  observedAt:z.string().datetime().nullable().default(null),
})
export const observedUpgradeSchema=z.object({
  observedAt:z.string().datetime(),gameBuild:z.string().max(100),currentRank:z.number().int().nonnegative(),maxRank:z.number().int().nonnegative(),
  minItemLevel:z.number().nonnegative(),maxItemLevel:z.number().nonnegative(),upgradeable:z.boolean(),
  levels:z.array(z.object({rank:z.number().int().nonnegative(),itemLevelIncrement:z.number().nonnegative(),
    currencies:z.array(z.object({currencyId:z.string().min(1).max(80),amount:z.number().int().nonnegative()})).max(20),
    items:z.array(z.object({itemId:z.number().int().positive(),amount:z.number().int().nonnegative()})).max(20),
    moneyCost:z.number().int().nonnegative().nullable().default(null),failureMessage:z.string().max(1000).nullable().default(null),
  })).max(50),
})
const itemProgressionFields = {
  observedUpgrade:observedUpgradeSchema.nullable().optional(),
  instanceId:z.string().max(200).nullable().optional(),locationKey:z.string().max(200).nullable().optional(),vaultChoiceGroup:z.string().max(200).nullable().optional(),
  inventoryType:z.number().int().nonnegative().nullable().optional(),
  requiredLevel:z.number().int().nonnegative().nullable().optional(),
  classId:z.number().int().nonnegative().optional(),subclassId:z.number().int().nonnegative().optional(),
  allowableClassMask:z.number().int().nullable().optional(),specIds:z.array(z.number().int().positive()).max(100).nullable().optional(),
  primaryStats:z.array(z.enum(['strength','agility','intellect'])).max(3).nullable().optional(),
  bonusIds:z.array(z.number().int().nonnegative()).max(128).nullable().optional(),
  enchantId:z.number().int().nonnegative().nullable().optional(),gemIds:z.array(z.number().int().nonnegative()).max(10).nullable().optional(),
  upgradeTrackId:z.string().max(100).nullable().optional(),upgradeRank:z.number().int().positive().nullable().optional(),
  uniqueGroups:z.array(z.string().max(100)).max(20).optional(),restrictionGroups:z.array(z.string().max(100)).max(20).optional(),
  variantCoverage:z.enum(['complete','partial','unknown']).optional(),
}
const baseGearItemSchema = z.object({ slot: gearSlotSchema, itemId: z.number().int().positive().nullable().default(null), name: z.string().max(200), itemLevel: z.number().nonnegative().nullable().default(null), enchant: z.string().max(200).nullable().default(null), gems: z.array(z.string().max(200)).max(10).default([]), gemsCoverage: z.enum(['unknown', 'complete']).default('unknown'), enchantCoverage: z.enum(['unknown', 'complete']).default('unknown'), appearanceId: z.number().int().positive().nullable().default(null), itemLink: z.string().max(2000).nullable().default(null), stats: z.array(z.object({ text: z.string().max(160), secondary: z.boolean().default(false) })).max(24).default([]), effects: z.array(z.string().max(600)).max(10).default([]) })
export const gearItemSchema = baseGearItemSchema.extend(itemProgressionFields)
export const observedGearItemSchema = gearItemSchema
export type GearItem = z.infer<typeof observedGearItemSchema>
export const inventoryObservationSchema=z.object({
  schemaVersion:z.literal(1).default(1),location:z.enum(['equipped','bags','bank','vault']),
  observedAt:z.string().datetime().nullable().default(null),coverage:z.enum(['complete','partial','unknown']).default('unknown'),
  items:z.array(gearItemSchema).max(2500).default([]),
  // Every reward belongs to one mutually exclusive weekly claim, rather than owned inventory
  choiceGroup:z.string().max(200).nullable().default(null),
})
export type InventoryObservation=z.infer<typeof inventoryObservationSchema>
export const inventoryObservationsSchema=z.array(inventoryObservationSchema).max(4).refine(entries=>new Set(entries.map(entry=>entry.location)).size===entries.length,'Duplicate inventory location')
export const providerRefSchema = z.object({ provider: z.enum(['addon', 'blizzard', 'manual', 'demo']), edition: z.literal('retail').default('retail'), region: z.string().min(1).max(20), realmId: z.string().min(1).max(100), characterKey: z.string().min(1).max(200) })
export type ProviderRef = z.infer<typeof providerRefSchema>
export const ratingSchema = z.object({ value: z.number().nonnegative().nullable(), label: z.string().max(120), rank: z.number().int().positive().nullable().default(null), population: z.number().int().positive().nullable().default(null), seasonId: z.string().nullable().default(null), observedAt: z.string().datetime().nullable().default(null), source: z.string().max(100).nullable().default(null), sourceUrl: z.string().url().nullable().default(null), rankScope: z.string().max(100).nullable().default(null) })
export type ActivityRating = z.infer<typeof ratingSchema>
export const statsSchema = z.object({
  primary: z.object({ name: z.enum(['Strength', 'Agility', 'Intellect']), value: z.number().nonnegative() }).nullable().default(null),
  stamina: z.number().nonnegative().nullable().default(null), health: z.number().nonnegative().nullable().default(null),
  // Secondary stats are percentages as shown on the in-game character sheet
  crit: z.number().nullable().default(null), haste: z.number().nullable().default(null), mastery: z.number().nullable().default(null), versatility: z.number().nullable().default(null),
  // Rating behind each percentage, needed to work out what a swap does after diminishing returns
  ratings: z.object({ crit: z.number().nullable().default(null), haste: z.number().nullable().default(null), mastery: z.number().nullable().default(null), versatility: z.number().nullable().default(null) }).nullable().default(null),
  // The part of each percentage that comes from rating, after diminishing returns; base percentages and buffs are excluded
  ratingBonus: z.object({ crit: z.number().nullable().default(null), haste: z.number().nullable().default(null), mastery: z.number().nullable().default(null), versatility: z.number().nullable().default(null) }).nullable().default(null),
  source: z.string().max(60), observedAt: z.string().datetime().nullable().default(null),
})
export type CharacterStats = z.infer<typeof statsSchema>
export const characterSchema = z.object({
  id: z.string().min(1).max(100), edition: z.literal('retail').default('retail'), region: z.string().min(1).max(20), realm: z.string().min(1).max(100), name: z.string().min(1).max(100),
  className: z.string().max(100).default('Unknown'), specName: z.string().max(100).default('Unknown'), specId: specializationIdSchema.default(null), raceName: z.string().max(100).default('Unknown'), raceId: z.number().int().nonnegative().nullable().default(null), level: z.number().int().nonnegative().nullable().default(null),
  archived: z.boolean().default(false), favorite: z.boolean().default(false), isMain: z.boolean().default(false), demo: z.boolean().default(false),
  observedAt: z.string().datetime().nullable().default(null), importedAt: z.string().datetime().nullable().default(null), sourceRefs: z.array(providerRefSchema).max(20).default([]), gear: z.array(observedGearItemSchema).max(40).default([]),
  progressionResources:progressionResourcesSchema.optional(),
  inventoryObservations:inventoryObservationsSchema.optional(),
  itemLevel: z.number().nonnegative().nullable().default(null), targetItemLevel: z.number().nonnegative().nullable().default(null), maxItemLevel: z.number().nonnegative().nullable().default(null), gearSource: z.string().max(100).nullable().default(null), gearSourceUrl: z.string().url().nullable().default(null), gearObservedAt: z.string().datetime().nullable().default(null),
  ratings: z.object({ mythicPlus: ratingSchema.nullable().default(null), raiding: ratingSchema.nullable().default(null), pvp: ratingSchema.nullable().default(null) }).default({ mythicPlus: null, raiding: null, pvp: null }),
  collectionObservedAt:z.string().datetime().nullable().default(null), collectionScopeId: z.string().max(100).nullable().default(null), collectionCoverage: z.enum(['unknown', 'partial', 'complete']).default('unknown'), collectedAppearanceIds: z.array(z.number().int().positive()).max(100000).default([]),
  gearCoverage: z.enum(['unknown', 'partial', 'complete']).default('partial'), customizationCoverage: z.enum(['unknown', 'partial', 'complete']).default('unknown'), gameBuild: z.string().max(100).nullable().default(null), customization: z.array(z.object({ optionId: z.number().int(), choiceId: z.number().int() })).max(200).default([]),
  sex: z.enum(['male', 'female']).nullable().default(null),
  // Local asset handles for Blizzard's official character renders, cached on this computer
  renders: z.object({ main: z.string().max(300).nullable().default(null), inset: z.string().max(300).nullable().default(null), avatar: z.string().max(300).nullable().default(null), observedAt: z.string().datetime().nullable().default(null) }).nullable().default(null),
  observedTransmog: z.partialRecord(appearanceSlotSchema, z.object({ itemId: z.number().int().positive(), modifiedAppearanceId: z.number().int().positive().nullable(), name: z.string().max(200) })).default({}),
  observedTransmogAt: z.string().datetime().nullable().default(null),
  // Weekly progress is kept per source so an estimate never overwrites the addon's live Great Vault
  weekly: weeklySchema.default({ addon: null, raiderio: null, blizzard: null }),
  stats: statsSchema.nullable().default(null),
  talents: z.object({ loadout: z.string().min(1).max(400), specId: specializationIdSchema.default(null), source: z.string().max(60), observedAt: z.string().datetime().nullable().default(null) }).nullable().default(null),
})
export type Character = z.infer<typeof characterSchema>
export const addCharacterSchema = characterSchema.omit({ id: true }).extend({ id: z.string().optional() })
export type AddCharacterInput = z.input<typeof addCharacterSchema>
// PATCH contracts must omit absent fields; Zod 4 applies nested defaults inside partial()
export const characterPatchSchema = z.object({ favorite: characterSchema.shape.favorite.removeDefault().optional(), isMain: characterSchema.shape.isMain.removeDefault().optional(), archived: characterSchema.shape.archived.removeDefault().optional(), targetItemLevel: characterSchema.shape.targetItemLevel.removeDefault().optional() })
export type CharacterPatch = z.infer<typeof characterPatchSchema>
export const gearDraftSchema = z.object({ id: z.string(), characterId: z.string(), specId: z.number().int().nullable(), activity: activitySchema, rulesetId: z.string().default('unknown'), name: z.string().max(100), items: z.array(gearItemSchema).max(40), updatedAt: z.string().datetime() })
export type GearDraft = z.infer<typeof gearDraftSchema>
export const appearanceRefSchema = z.object({ appearanceId: z.number().int().positive().nullable(), modifiedAppearanceId: z.number().int().positive().nullable().default(null), itemId: z.number().int().positive().nullable().default(null), variantKey: z.string().nullable().default(null), source: z.string().max(100) })
export type AppearanceRef = z.infer<typeof appearanceRefSchema>
export const outfitSchema = z.object({ id: z.string(), characterId: z.string(), name: z.string().min(1).max(100), slots: z.partialRecord(appearanceSlotSchema, appearanceRefSchema), hiddenSlots: z.array(appearanceSlotSchema).default([]), illusionIds: z.object({ mainHand: z.number().int().positive().optional(), offHand: z.number().int().positive().optional() }).default({}), acquisitionTargets:z.array(z.object({slot:appearanceSlotSchema,note:z.string().max(500),sourceUrl:z.string().url().refine(value=>new URL(value).protocol==='https:').nullable().default(null)})).max(40).default([]), templateId: z.string().nullable().default(null), updatedAt: z.string().datetime() })
export type Outfit = z.infer<typeof outfitSchema>
export const appSettingsSchema = z.object({ theme: z.enum(['system', 'light', 'dark']).default('system'), lastCharacterId: z.string().nullable().default(null), activity: activitySchema.default('mythicPlus'), characterActivities: z.record(z.string(),activitySchema).default({}), addonPath: z.string().nullable().default(null), reducedMotion: z.boolean().default(false), sidebarWidth: z.number().int().min(220).max(360).default(240), wowInstallPath: z.string().max(1000).nullable().default(null), setupDismissed: z.boolean().default(false) })
export type AppSettings = z.infer<typeof appSettingsSchema>
export const appSettingsPatchSchema = z.object({
  theme: appSettingsSchema.shape.theme.removeDefault().optional(),
  lastCharacterId: appSettingsSchema.shape.lastCharacterId.removeDefault().optional(),
  activity: appSettingsSchema.shape.activity.removeDefault().optional(),
  characterActivities: appSettingsSchema.shape.characterActivities.removeDefault().optional(),
  addonPath: appSettingsSchema.shape.addonPath.removeDefault().optional(),
  reducedMotion: appSettingsSchema.shape.reducedMotion.removeDefault().optional(),
  sidebarWidth: appSettingsSchema.shape.sidebarWidth.removeDefault().optional(),
  setupDismissed: appSettingsSchema.shape.setupDismissed.removeDefault().optional(),
})
export type ImportReport = { imported: string[]; unchanged: string[]; errors: Array<{ recordKey: string; reason: string }>; revision: number }
export type CharacterChanged = { characterId: string; revision: number }
export type RosterChanged = { revision: number }
/** Raw weekly export from addon 0.2+; reset times come from the game client itself */
export const addonWeeklySchema = z.object({
  weeklyResetAt: z.string().datetime().nullable().default(null), dailyResetAt: z.string().datetime().nullable().default(null),
  vault: z.array(z.object({ kind: z.enum(['raid', 'dungeon', 'world']), index: z.number().int().min(1).max(5), threshold: z.number().int().nonnegative(), progress: z.number().int().nonnegative(), level: z.number().int().nullable().default(null) })).max(15).default([]),
  lockouts: z.array(z.object({ name: z.string().max(120), difficulty: z.string().max(60).default(''), killed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), raid: z.boolean().default(true) })).max(60).default([]),
  runs: z.array(z.object({ dungeon: z.string().max(120), level: z.number().int().nonnegative(), timed: z.boolean().nullable().default(null) })).max(60).default([]),
})
export const addonRecordSchema = z.object({ guid: z.string().min(1).max(100), region: z.string().min(1).max(20), realm: z.string().min(1).max(100), name: z.string().min(1).max(100), className: z.string().max(100), raceName: z.string().max(100), raceId: z.number().int().nullable().default(null), level: z.number().int().nullable().default(null), specName: z.string().default('Unknown'), specId: specializationIdSchema.default(null), observedAt: z.string().datetime(), sessionId: z.string().min(1).max(100), sequence: z.number().int().nonnegative(), itemLevel: z.number().nonnegative().nullable().default(null), gear: z.array(gearItemSchema).max(40), gearCoverage: z.enum(['unknown', 'partial', 'complete']).default('partial'), customizationCoverage: z.enum(['unknown', 'partial', 'complete']).default('unknown'), gameBuild: z.string().max(100).nullable().default(null), customization: characterSchema.shape.customization.default([]), collectionObservedAt:z.string().datetime().nullable().default(null), collectionScopeId: z.string().nullable().default(null), collectionCoverage: z.enum(['unknown', 'partial', 'complete']).default('unknown'), collectedAppearanceIds: z.array(z.number().int().positive()).max(100000).default([]), progressionResources: progressionResourcesSchema.optional(), inventoryObservations: inventoryObservationsSchema.optional(), weekly: addonWeeklySchema.nullable().default(null), talentLoadout: z.string().max(400).nullable().default(null) })
export type AddonCharacterRecord = z.infer<typeof addonRecordSchema>
// Character records are independently validated so one invalid alt cannot discard valid siblings
export const addonEnvelopeSchema = z.object({ schemaVersion: z.literal(1), addonVersion: z.string().max(100), sourceProfileId: z.string().min(1).max(100), exportedAt: z.string().datetime(), characters: z.record(z.string(), z.unknown()) })
export type AddonEnvelope = z.infer<typeof addonEnvelopeSchema>




