import { expect, it } from 'vite-plus/test'
import { outfitModelPieces } from './outfit-model-pieces'

it('uses the selected appearance IDs and respects hidden slots and separate shoulders', () => {
  const appearance = { itemId: 100, appearanceId: 200, modifiedAppearanceId: 300, variantKey: null, source: 'Fixture' }
  const split = { ...appearance, modifiedAppearanceId: 400 }
  const pieces = outfitModelPieces({
    slots: { head: appearance, shoulder: appearance, shoulderLeft: split, chest: appearance },
    hiddenSlots: ['head', 'shoulderRight'],
  })
  expect(pieces).toEqual([
    { slot: 'chest', itemId: 100, appearanceId: 200, modifiedAppearanceId: 300 },
    { slot: 'shoulderLeft', itemId: 100, appearanceId: 200, modifiedAppearanceId: 400 },
  ])
})
