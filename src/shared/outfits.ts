import { z } from 'zod'
import { appearanceSlotSchema, outfitSchema, type AppearanceSlot, type Character, type Outfit } from './domain'
import { evidenceRefSchema, type EvidenceRef } from './evidence'

export const OUTFIT_CODE_MAX_BYTES = 64 * 1024
const id = z.number().int().min(1).max(2_147_483_647)
const transportSlotSchema = z.object({ slot: appearanceSlotSchema, appearanceId: id.nullable(), modifiedAppearanceId: id.nullable(), itemId: id.nullable() }).strict()
export const outfitTransportSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(1).max(100),
  slots: z.array(transportSlotSchema).max(40), hiddenSlots: z.array(appearanceSlotSchema).max(40),
  illusionIds: z.object({ mainHand: id.optional(), offHand: id.optional() }).strict(),
}).strict().superRefine((value, context) => {
  if (new Set(value.slots.map(slot => slot.slot)).size !== value.slots.length) context.addIssue({ code: 'custom', message: 'An outfit contains duplicate slots' })
  if (new Set(value.hiddenSlots).size !== value.hiddenSlots.length) context.addIssue({ code: 'custom', message: 'An outfit contains duplicate hidden slots' })
})
export type OutfitTransport = z.infer<typeof outfitTransportSchema>
export type OutfitDraft = Outfit

/** Stable field ordering is part of transport v1, never an authenticity guarantee */
export function canonicalOutfitJson(value: OutfitTransport): string {
  const stable = (input: unknown): unknown => Array.isArray(input) ? input.map(stable) : input !== null && typeof input === 'object' ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, stable(item)])) : input
  const parsed = outfitTransportSchema.parse(value)
  return JSON.stringify(stable({ ...parsed, slots: [...parsed.slots].sort((a, b) => a.slot.localeCompare(b.slot, 'en')), hiddenSlots: [...parsed.hiddenSlots].sort() }))
}

export function outfitCrc32(bytes: Uint8Array): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function base64url(bytes: Uint8Array): string {
  let output = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    output += alphabet[(value >>> 18) & 63]! + alphabet[(value >>> 12) & 63]!
    if (i + 1 < bytes.length) output += alphabet[(value >>> 6) & 63]!
    if (i + 2 < bytes.length) output += alphabet[value & 63]!
  }
  return output
}
function unbase64url(text: string): Uint8Array {
  if (text.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('The outfit code has invalid encoding')
  const bytes: number[] = []
  let buffer = 0, bits = 0
  for (const character of text) {
    buffer = (buffer << 6) | alphabet.indexOf(character)
    bits += 6
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255) }
  }
  const result = Uint8Array.from(bytes)
  if (base64url(result) !== text) throw new Error('The outfit code has noncanonical encoding')
  return result
}

export function encodeOutfitTransport(outfit: OutfitDraft): string {
  const parsed = outfitSchema.parse(outfit)
  const value: OutfitTransport = { schemaVersion: 1, name: parsed.name, slots: Object.entries(parsed.slots).map(([slot, appearance]) => ({ slot: slot as AppearanceSlot, appearanceId: appearance!.appearanceId, modifiedAppearanceId: appearance!.modifiedAppearanceId, itemId: appearance!.itemId })), hiddenSlots: parsed.hiddenSlots, illusionIds: parsed.illusionIds }
  const bytes = new TextEncoder().encode(canonicalOutfitJson(value))
  if (bytes.length > OUTFIT_CODE_MAX_BYTES) throw new Error('The outfit is larger than 64 KiB')
  return `WCO1.${base64url(bytes)}.${outfitCrc32(bytes)}`
}

export function decodeOutfitTransport(text: string): OutfitTransport {
  const code = text.trim()
  if (code.length > Math.ceil(OUTFIT_CODE_MAX_BYTES * 4 / 3) + 14) throw new Error('The outfit code is larger than 64 KiB')
  const match = /^WCO1\.([A-Za-z0-9_-]+)\.([a-f0-9]{8})$/.exec(code)
  if (!match) throw new Error('Paste a WOW Companion outfit code beginning with WCO1')
  const bytes = unbase64url(match[1]!)
  if (bytes.length > OUTFIT_CODE_MAX_BYTES) throw new Error('The outfit code is larger than 64 KiB')
  if (outfitCrc32(bytes) !== match[2]) throw new Error('The outfit code is incomplete or corrupted — copy it again')
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new Error('The outfit code does not contain valid outfit data') }
  const result = outfitTransportSchema.safeParse(parsed)
  if (!result.success) throw new Error('The outfit code uses an unsupported version, slot, or appearance')
  return result.data
}

/** Import only appearance intent; never import another character's identity or observation claims */
export function applyOutfitTransport(transport: OutfitTransport, draft: Outfit, now: string): Outfit {
  const parsed = outfitTransportSchema.parse(transport)
  return outfitSchema.parse({ ...draft, name: parsed.name, slots: Object.fromEntries(parsed.slots.map(({ slot, ...appearance }) => [slot, { ...appearance, variantKey: null, source: 'Imported outfit plan' }])), hiddenSlots: parsed.hiddenSlots, illusionIds: parsed.illusionIds, acquisitionTargets: [], templateId: null, updatedAt: now })
}

export const appearanceObservationSchema = z.object({ schemaVersion: z.literal(1), characterId: z.string(), collectionScopeId: z.string().nullable(), appearanceIds: z.array(id), coverage: z.enum(['complete', 'partial', 'unknown']), observedAt: z.string().datetime().nullable(), evidenceRefs: z.array(evidenceRefSchema) })
export type AppearanceObservation = z.infer<typeof appearanceObservationSchema>
export type OutfitOwnership = Array<{ slot: AppearanceSlot; state: 'collected' | 'missing' | 'unknown' | 'hidden'; scopeId: string | null; observedAt: string | null; evidenceRefs: EvidenceRef[]; reason: string }>
export function appearanceObservationFromCharacter(character: Character): AppearanceObservation {
  return { schemaVersion: 1, characterId: character.id, collectionScopeId: character.collectionScopeId, appearanceIds: character.collectedAppearanceIds, coverage: character.collectionCoverage, observedAt: character.collectionObservedAt, evidenceRefs: [] }
}
export function evaluateOutfitOwnership(outfit: OutfitDraft, observations: AppearanceObservation[]): OutfitOwnership {
  const own = observations.filter(observation => observation.characterId === outfit.characterId)
  const scopes = new Set(own.flatMap(observation => observation.collectionScopeId ? [observation.collectionScopeId] : []))
  const eligible = observations.filter(observation => observation.characterId === outfit.characterId || !!observation.collectionScopeId && scopes.has(observation.collectionScopeId))
  const latest = [...eligible].sort((a, b) => (Date.parse(b.observedAt ?? '') || 0) - (Date.parse(a.observedAt ?? '') || 0))
  const visibleSlots = new Set([...Object.keys(outfit.slots), ...outfit.hiddenSlots] as AppearanceSlot[])
  return [...visibleSlots].map(slot => {
    const wanted = outfit.slots[slot]?.appearanceId
    const positive = wanted ? latest.find(observation => observation.appearanceIds.includes(wanted)) : undefined
    const complete = latest[0]?.coverage === 'complete' && latest[0].observedAt ? latest[0] : undefined
    const evidence = positive ?? complete ?? latest[0]
    const state = outfit.hiddenSlots.includes(slot) ? 'hidden' : !wanted ? 'unknown' : positive ? 'collected' : complete ? 'missing' : 'unknown'
    return { slot, state, scopeId: evidence?.collectionScopeId ?? null, observedAt: evidence?.observedAt ?? null, evidenceRefs: evidence?.evidenceRefs ?? [], reason: state === 'hidden' ? 'This slot is intentionally hidden' : state === 'collected' ? 'This appearance was observed in the collection' : state === 'missing' ? 'This appearance was absent from the complete observed collection' : !wanted ? 'The appearance identity has not been resolved' : 'Collection coverage is incomplete — absence is unknown' }
  })
}

export type ModelCapability = { gameBuild: string | null; rendererVersion: string; testedFixtureIds: string[]; customization: boolean; armorSwaps: boolean; weaponAttachments: boolean; bodyVariants: boolean; animation: boolean; missingAssetRecovery: boolean; assetsAvailable: boolean }
export function evaluateModelCapability(capability: ModelCapability): { supported: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (!capability.gameBuild) reasons.push('The source game build is unknown')
  if (capability.testedFixtureIds.length < 2) reasons.push('Two real-character references have not passed validation')
  for (const [key, message] of [['customization', 'Character customization'], ['armorSwaps', 'Dynamic armor changes'], ['weaponAttachments', 'Weapon attachments'], ['bodyVariants', 'Body variants'], ['animation', 'Character animation'], ['missingAssetRecovery', 'Missing-asset recovery'], ['assetsAvailable', 'Required local assets']] as const) if (!capability[key]) reasons.push(`${message} has not passed the desktop assembly gate`)
  return { supported: reasons.length === 0, reasons }
}
