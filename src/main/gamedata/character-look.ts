import type { CharacterModelLook, DressedModel } from '../../shared/model'
import type { Row } from './wdc'

const num = (value: unknown) => Number(Array.isArray(value) ? value[0] : value) || 0
type Tables = {
  options: Map<number, Row>
  choices: Map<number, Row>
  elements: Map<number, Row>
  geosets: Map<number, Row>
  materials: Map<number, Row>
  layers: Map<number, Row>
}

/** Resolve synced choices on this body only. Battle.net may also return choices belonging to another form. */
export function syncedCharacterLook(model: number, layout: number, customization: CharacterModelLook['customization'], tables: Tables, textureFile: (material: number) => number | null) {
  const selected = new Set(customization.flatMap(({ optionId, choiceId }) => {
    const option = tables.options.get(optionId), choice = tables.choices.get(choiceId)
    return num(option?.ChrModelID) === model && num(choice?.ChrCustomizationOptionID) === optionId ? [choiceId] : []
  }))
  const optionIds = new Set([...selected].map(id => num(tables.choices.get(id)?.ChrCustomizationOptionID)))
  const relevant = [...tables.elements.values()].filter(row => optionIds.has(num(tables.choices.get(num(row.ChrCustomizationChoiceID))?.ChrCustomizationOptionID)))
  const active = relevant.filter(row => selected.has(num(row.ChrCustomizationChoiceID)) && (!num(row.RelatedChrCustomizationChoiceID) || selected.has(num(row.RelatedChrCustomizationChoiceID))))
  const geoset = (row: Row) => {
    const entry = tables.geosets.get(num(row.ChrCustomizationGeosetID))
    return entry ? num(entry.GeosetType) * 100 + num(entry.GeosetID) : null
  }
  const positiveId = (id: number | null): id is number => id != null && id > 0
  const replaceGeosets = new Set(relevant.map(geoset).filter(positiveId))
  const pickedGeosets = new Set(active.map(geoset).filter(positiveId))
  const skin: Array<DressedModel['skin'][number] & { layer: number }> = []
  const textures = new Map<number, number>()
  const layers = [...tables.layers.values()].filter(row => num(row.CharComponentTextureLayoutsID) === layout)
  for (const entry of active) {
    const material = tables.materials.get(num(entry.ChrCustomizationMaterialID))
    if (!material) continue
    const fileDataId = num(material.FileDataID) || textureFile(num(material.MaterialResourcesID))
    if (!fileDataId) continue
    const target = num(material.ChrModelTextureTargetID)
    const layer = layers.find(row => (Array.isArray(row.ChrModelTextureTargetID) ? row.ChrModelTextureTargetID : [row.ChrModelTextureTargetID]).map(Number).includes(target))
    if (!layer) continue
    const type = num(layer.TextureType)
    if (type !== 1) { if (type > 1 && type !== 8) textures.set(type, fileDataId); continue }
    const mask = num(layer.TextureSectionTypeBitMask)
    const sections = mask === -1 ? [null] : Array.from({ length: 31 }, (_, bit) => bit).filter(bit => mask & (1 << bit))
    for (const section of sections) skin.push({ section, fileDataId, layer: num(layer.Layer) })
  }
  return {
    skin: skin.sort((a, b) => a.layer - b.layer).map(({ section, fileDataId }) => ({ section, fileDataId })),
    textures, replaceGeosets, pickedGeosets,
    conditionalModel: active.map(row => num(row.ChrCustomizationCondModelID)).find(Boolean),
  }
}
