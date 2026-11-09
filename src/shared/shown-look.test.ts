import { describe, expect, it } from 'vite-plus/test'
import { outdatedRenderSlots } from './shown-look'

const blizzard = { head: { itemId: 10, modifiedAppearanceId: 100, name: 'Old hood' }, chest: { itemId: 11, modifiedAppearanceId: null, name: 'Plain chest' }, neck: { itemId: 12, modifiedAppearanceId: null, name: 'Neck' } }

describe('outdated Blizzard pictures', () => {
  it('names slots where the look seen in game differs from Blizzard', () => {
    const shownLook = { observedAt: '2026-11-09T12:00:00.000Z', slots: { head: { modifiedAppearanceId: 200, itemId: 20, name: 'New hood' }, chest: { modifiedAppearanceId: 300, itemId: 11, name: 'Plain chest' } } }
    expect(outdatedRenderSlots({ shownLook, observedTransmog: blizzard, observedTransmogAt: '2026-11-06T12:00:00.000Z' })).toEqual(['head'])
    expect(outdatedRenderSlots({ shownLook: { ...shownLook, slots: { ...shownLook.slots, head: { modifiedAppearanceId: 100, itemId: 10, name: 'Old hood' } } }, observedTransmog: blizzard, observedTransmogAt: null })).toEqual([])
  })
  it('trusts newer Blizzard data and needs both sides', () => {
    const shownLook = { observedAt: '2026-11-01T12:00:00.000Z', slots: { head: { modifiedAppearanceId: 200, itemId: 20, name: null } } }
    expect(outdatedRenderSlots({ shownLook, observedTransmog: blizzard, observedTransmogAt: '2026-11-06T12:00:00.000Z' })).toBeNull()
    expect(outdatedRenderSlots({ shownLook: null, observedTransmog: blizzard, observedTransmogAt: null })).toBeNull()
  })
})
