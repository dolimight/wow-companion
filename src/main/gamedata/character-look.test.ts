import { expect, it } from 'vite-plus/test'
import { syncedCharacterLook } from './character-look'
import type { Row } from './wdc'

const rows = (...entries: Row[]) => new Map(entries.map(entry => [Number(entry.ID), entry]))

it('uses the selected body choices, applies dependent face layers, and ignores choices for other forms', () => {
  const tables = {
    options: rows({ ID: 1, ChrModelID: 71 }, { ID: 2, ChrModelID: 71 }, { ID: 3, ChrModelID: 123 }),
    choices: rows({ ID: 10, ChrCustomizationOptionID: 1 }, { ID: 20, ChrCustomizationOptionID: 2 }, { ID: 30, ChrCustomizationOptionID: 3 }),
    elements: rows(
      { ID: 1, ChrCustomizationChoiceID: 10, ChrCustomizationMaterialID: 100 },
      { ID: 2, ChrCustomizationChoiceID: 20, RelatedChrCustomizationChoiceID: 10, ChrCustomizationMaterialID: 200, ChrCustomizationGeosetID: 42 },
      { ID: 3, ChrCustomizationChoiceID: 20, RelatedChrCustomizationChoiceID: 999, ChrCustomizationMaterialID: 300 },
      { ID: 4, ChrCustomizationChoiceID: 30, ChrCustomizationMaterialID: 300 },
    ),
    geosets: rows({ ID: 42, GeosetType: 2, GeosetID: 9 }),
    materials: rows(
      { ID: 100, ChrModelTextureTargetID: 7, MaterialResourcesID: 1000 },
      { ID: 200, ChrModelTextureTargetID: 8, MaterialResourcesID: 2000 },
      { ID: 300, ChrModelTextureTargetID: 8, MaterialResourcesID: 3000 },
    ),
    layers: rows(
      { ID: 1, CharComponentTextureLayoutsID: 147, ChrModelTextureTargetID: [7], TextureType: 1, TextureSectionTypeBitMask: -1, Layer: 0 },
      { ID: 2, CharComponentTextureLayoutsID: 147, ChrModelTextureTargetID: [8], TextureType: 1, TextureSectionTypeBitMask: 32, Layer: 1 },
    ),
  }
  const look = syncedCharacterLook(71, 147, [{ optionId: 1, choiceId: 10 }, { optionId: 2, choiceId: 20 }, { optionId: 3, choiceId: 30 }], tables, resource => resource + 1)
  expect(look.skin).toEqual([{ section: null, fileDataId: 1001 }, { section: 5, fileDataId: 2001 }])
  expect([...look.pickedGeosets]).toEqual([209])
})
