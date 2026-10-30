import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { outfitSchema } from './domain'
import { applyOutfitTransport, canonicalOutfitJson, decodeOutfitTransport, encodeOutfitTransport, evaluateModelCapability, evaluateOutfitOwnership, outfitCrc32, type AppearanceObservation, type OutfitTransport } from './outfits'

const now = '2026-10-29T12:00:00.000Z'
const outfit = outfitSchema.parse({ id: 'outfit-a', characterId: 'character-a', name: 'Étoile 🌙', slots: { chest: { appearanceId: 44, modifiedAppearanceId: 300, itemId: 1200, source: 'Manual plan' } }, hiddenSlots: ['head'], illusionIds: { mainHand: 12 }, updatedAt: now })
const observation = (patch: Partial<AppearanceObservation> = {}): AppearanceObservation => ({ schemaVersion: 1, characterId: 'character-a', collectionScopeId: 'account-a', appearanceIds: [], coverage: 'partial', observedAt: now, evidenceRefs: [], ...patch })
function codeFor(value: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(value)); return `WCO1.${Buffer.from(bytes).toString('base64url')}.${outfitCrc32(bytes)}` }
describe('outfit transport', () => {
  it('matches the Lua shared transport fixture byte for byte', () => {
    const fixture = readFileSync('addon/tests/outfit-fixture.lua', 'utf8')
    const code = fixture.match(/code = \[=\[([\s\S]*?)\]=\]/)![1]!
    const json = fixture.match(/json = \[=\[([\s\S]*?)\]=\]/)![1]!
    const value = decodeOutfitTransport(code)
    expect(canonicalOutfitJson(value)).toBe(json)
    const generated = outfitSchema.parse({ id: 'fixture', characterId: 'fixture-character', name: value.name, slots: { chest: { ...value.slots[0], source: 'Fixture' } }, hiddenSlots: value.hiddenSlots, illusionIds: value.illusionIds, updatedAt: now })
    expect(encodeOutfitTransport(generated)).toBe(code)
  })
  it('round-trips Unicode names, exact source IDs, hidden slots and illusions without transporting character identity', () => {
    const code = encodeOutfitTransport(outfit)
    const decoded = decodeOutfitTransport(code)
    expect(decoded).toEqual({ schemaVersion: 1, name: 'Étoile 🌙', slots: [{ slot: 'chest', appearanceId: 44, modifiedAppearanceId: 300, itemId: 1200 }], hiddenSlots: ['head'], illusionIds: { mainHand: 12 } })
    expect(decoded).not.toHaveProperty('characterId')
    const target = { ...outfit, id: 'target-draft', characterId: 'character-b', acquisitionTargets: [{slot:'chest' as const,note:'Old acquisition plan',sourceUrl:null}] }
    expect(applyOutfitTransport(decoded, target, now)).toMatchObject({ id: 'target-draft', characterId: 'character-b', name: outfit.name, acquisitionTargets: [] })
  })
  it('rejects corruption, invalid UTF-8, noncanonical base64 and Lua-looking text', () => {
    const valid = encodeOutfitTransport(outfit)
    expect(() => decodeOutfitTransport(valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0'))).toThrow(/corrupted/)
    expect(() => decodeOutfitTransport('loadstring("hello")()')).toThrow(/WCO1/)
    expect(() => decodeOutfitTransport('WCO1.Zh.00000000')).toThrow(/noncanonical/)
    const bad = new Uint8Array([0xff, 0xff]); expect(() => decodeOutfitTransport(`WCO1.__8.${outfitCrc32(bad)}`)).toThrow(/valid outfit data/)
  })
  it('rejects unknown schemas, duplicate slots, invalid IDs, unknown fields and more than forty slots', () => {
    const valid = decodeOutfitTransport(encodeOutfitTransport(outfit))
    for (const bad of [{ ...valid, schemaVersion: 2 }, { ...valid, run: 'os.execute' }, { ...valid, slots: [...valid.slots, ...valid.slots] }, { ...valid, hiddenSlots: ['head', 'head'] }, { ...valid, slots: [{ ...valid.slots[0], itemId: 0 }] }, { ...valid, slots: Array(41).fill(valid.slots[0]) }]) expect(() => decodeOutfitTransport(codeFor(bad))).toThrow(/unsupported/)
    expect(() => decodeOutfitTransport(`WCO1.${'A'.repeat(90_000)}.00000000`)).toThrow(/64 KiB/)
  })
  it('uses the standard CRC32 and deterministic object/slot ordering', () => {
    expect(outfitCrc32(new TextEncoder().encode('123456789'))).toBe('cbf43926')
    const first = decodeOutfitTransport(encodeOutfitTransport(outfit))
    const second: OutfitTransport = { illusionIds: first.illusionIds, hiddenSlots: first.hiddenSlots, slots: first.slots, name: first.name, schemaVersion: 1 }
    expect(canonicalOutfitJson(first)).toBe(canonicalOutfitJson(second))
  })
})
describe('outfit ownership', () => {
  it('requires complete observations to report missing and retains intentionally hidden slots', () => {
    expect(evaluateOutfitOwnership(outfit, [observation()])).toMatchObject([{ slot: 'chest', state: 'unknown' }, { slot: 'head', state: 'hidden' }])
    expect(evaluateOutfitOwnership(outfit, [observation({ coverage: 'complete' })])[0]?.state).toBe('missing')
    expect(evaluateOutfitOwnership(outfit, [observation({ appearanceIds: [44] })])[0]?.state).toBe('collected')
    expect(evaluateOutfitOwnership(outfit, [observation({ coverage: 'complete', observedAt: null })])[0]?.state).toBe('unknown')
  })
  it('does not borrow another character collection until matching account membership is established', () => {
    const peer = observation({ characterId: 'character-b', appearanceIds: [44] })
    expect(evaluateOutfitOwnership(outfit, [peer])[0]?.state).toBe('unknown')
    expect(evaluateOutfitOwnership(outfit, [observation({ collectionScopeId: null }), peer])[0]?.state).toBe('unknown')
    expect(evaluateOutfitOwnership(outfit, [observation(), peer])[0]?.state).toBe('collected')
    expect(evaluateOutfitOwnership(outfit, [observation(), { ...peer, collectionScopeId: 'different-account' }])[0]?.state).toBe('unknown')
  })
  it('does not turn a newer partial scan into complete absence based on an older complete scan', () => {
    expect(evaluateOutfitOwnership(outfit, [observation({ coverage: 'complete', observedAt: '2026-10-28T00:00:00.000Z' }), observation()])[0]?.state).toBe('unknown')
  })
})
describe('desktop assembly gate', () => {
  it('does not treat an animated static GLB as a passing character builder', () => {
    const gate = evaluateModelCapability({ gameBuild: '12.1.5.70575', rendererVersion: 'glb-inspection', testedFixtureIds: ['static-glb'], customization: false, armorSwaps: false, weaponAttachments: false, bodyVariants: false, animation: true, missingAssetRecovery: true, assetsAvailable: true })
    expect(gate.supported).toBe(false)
    expect(gate.reasons).toContain('Dynamic armor changes has not passed the desktop assembly gate')
  })
})
