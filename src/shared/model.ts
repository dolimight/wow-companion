import type { AppearanceSlot } from './domain'

/**
 * A game model read from the installed game files for the 3D item viewer. Positions are in the game's coordinates
 * (Z up); the viewer turns the whole model upright
 */

/**
 * Keyframes for one animated value. `keys` lines up with the part's `animations`, or holds a single entry when the
 * value loops on a global clock (`global` is that clock's index into `globalLoops`). Values are flattened: three per
 * key for a vector, four for a rotation, one for a weight
 */
export type ModelTrack = { global: number; keys: Array<{ times: number[]; values: number[] } | null> }

export type ModelBone = {
  parent: number
  pivot: [number, number, number]
  /** Turned to face the camera, as glows and sprites are */
  billboard: boolean
  translation: ModelTrack | null
  rotation: ModelTrack | null
  scale: ModelTrack | null
}

/** A point items attach to, such as a hand or a shoulder, on a bone */
export type ModelAttachment = { id: number; bone: number; position: [number, number, number] }

/** One draw of the model: a run of triangles with its texture and how it blends */
export type ModelGroup = {
  start: number
  count: number
  /** The body piece it belongs to, such as 0 for the body or 401 for bare hands */
  geoset: number
  /** The game's texture slot: 0 a file, 1 the character's skin, 2 an item or cape, 6 hair, 11 to 13 a creature's skins */
  textureType: number
  /** The texture's file data ID, decoded by the app's game icon reader, or null when the game picks it at run time */
  texture: number | null
  /** The game's blend mode: 0 opaque, 1 alpha key, 2 alpha, 3 and 4 additive, 5 and 6 modulate, 7 blend add */
  blend: number
  /** Render flags: 0x1 unlit, 0x4 two-sided, 0x8 no depth test, 0x10 no depth write */
  flags: number
  /** Texture wrapping: 0x1 repeats across, 0x2 repeats down */
  wrap: number
  opacity: number | null
  color: number | null
  uvAnimation: number | null
  order: number
  /** The game's pixel combiner for its texture layers (see `combiners`) */
  combiner: number
  /** Its texture layers, the first being `texture` */
  layers: ModelLayer[]
}

/** One texture layer of a draw: its file, which coordinates it reads, and its own scrolling and weight */
export type ModelLayer = { texture: number | null; textureType: number; wrap: number; coords: 'uv' | 'uv2' | 'env'; uvAnimation: number | null; weight: number | null }

/**
 * The game's pixel combiners, numbered as wow.export numbers them (MIT, Kruithne and Marlamin), which follows the
 * client's shader names on wowdev.wiki
 */
export const combiners = [
  'Opaque', 'Mod', 'Opaque_Mod', 'Opaque_Mod2x', 'Opaque_Mod2xNA', 'Opaque_Opaque', 'Mod_Mod', 'Mod_Mod2x', 'Mod_Add', 'Mod_Mod2xNA', 'Mod_AddNA', 'Mod_Opaque',
  'Opaque_Mod2xNA_Alpha', 'Opaque_AddAlpha', 'Opaque_AddAlpha_Alpha', 'Opaque_Mod2xNA_Alpha_Add', 'Mod_AddAlpha', 'Mod_AddAlpha_Alpha', 'Opaque_Alpha_Alpha',
  'Opaque_Mod2xNA_Alpha_3s', 'Opaque_AddAlpha_Wgt', 'Mod_Add_Alpha', 'Opaque_ModNA_Alpha', 'Mod_AddAlpha_Wgt', 'Opaque_Mod_Add_Wgt', 'Opaque_Mod2xNA_Alpha_UnshAlpha',
  'Mod_Dual_Crossfade', 'Opaque_Mod2xNA_Alpha_Alpha', 'Mod_Masked_Dual_Crossfade', 'Opaque_Alpha', 'Guild', 'Guild_NoBorder', 'Guild_Opaque', 'Mod_Depth', 'Illum',
  'Mod_Mod_Mod_Const', 'Mod_Mod_Depth',
] as const
const combiner = (name: (typeof combiners)[number]) => combiners.indexOf(name)

/** Where each layer reads its coordinates, by the client's vertex shader names */
const vertexShaders: Record<string, Array<ModelLayer['coords']>> = {
  T1: ['uv'], T2: ['uv2'], Env: ['env'], T1_T2: ['uv', 'uv2'], T1_Env: ['uv', 'env'], Env_T1: ['env', 'uv'], Env_Env: ['env', 'env'], T1_T1: ['uv', 'uv'],
  T1_Env_T1: ['uv', 'env', 'uv'], T1_T1_T1: ['uv', 'uv', 'uv'], T1_Env_T2: ['uv', 'env', 'uv2'], T1_T2_T1: ['uv', 'uv2', 'uv'], T1_T2_T3: ['uv', 'uv2', 'uv2'],
  EdgeFade_T1: ['uv'], EdgeFade_T1_T2: ['uv', 'uv2'], EdgeFade_Env: ['env'], Color_T1_T2_T3: ['uv2', 'uv', 'uv2'],
}

/** The client's shader effects for batches whose shader number has the high bit set: the combiner and the vertex shader */
const effects: Array<[(typeof combiners)[number], string]> = [
  ['Opaque_Mod2xNA_Alpha', 'T1_Env'], ['Opaque_AddAlpha', 'T1_Env'], ['Opaque_AddAlpha_Alpha', 'T1_Env'], ['Opaque_Mod2xNA_Alpha_Add', 'T1_Env_T1'],
  ['Mod_AddAlpha', 'T1_Env'], ['Opaque_AddAlpha', 'T1_T1'], ['Mod_AddAlpha', 'T1_T1'], ['Mod_AddAlpha_Alpha', 'T1_Env'], ['Opaque_Alpha_Alpha', 'T1_Env'],
  ['Opaque_Mod2xNA_Alpha_3s', 'T1_Env_T1'], ['Opaque_AddAlpha_Wgt', 'T1_T1'], ['Mod_Add_Alpha', 'T1_Env'], ['Opaque_ModNA_Alpha', 'T1_Env'],
  ['Mod_AddAlpha_Wgt', 'T1_Env'], ['Mod_AddAlpha_Wgt', 'T1_T1'], ['Opaque_AddAlpha_Wgt', 'T1_T2'], ['Opaque_Mod_Add_Wgt', 'T1_Env'],
  ['Opaque_Mod2xNA_Alpha_UnshAlpha', 'T1_Env_T1'], ['Mod_Dual_Crossfade', 'T1'], ['Mod_Depth', 'EdgeFade_T1'], ['Opaque_Mod2xNA_Alpha_Alpha', 'T1_Env_T2'],
  ['Mod_Mod', 'EdgeFade_T1_T2'], ['Mod_Masked_Dual_Crossfade', 'T1_T2'], ['Opaque_Alpha', 'T1_T1'], ['Opaque_Mod2xNA_Alpha_UnshAlpha', 'T1_Env_T2'],
  ['Mod_Depth', 'EdgeFade_Env'], ['Guild', 'T1_T2_T1'], ['Guild_NoBorder', 'T1_T2'], ['Guild_Opaque', 'T1_T2_T1'], ['Illum', 'T1_T1'],
  ['Mod_Mod_Mod_Const', 'T1_T2_T3'], ['Mod_Mod_Mod_Const', 'Color_T1_T2_T3'], ['Opaque', 'T1'], ['Mod_Mod2x', 'EdgeFade_T1_T2'], ['Mod', 'EdgeFade_T1'],
  ['Mod_Mod_Depth', 'EdgeFade_T1_T2'],
]

/**
 * A batch's combiner and where each layer reads its coordinates. Shader numbers with the high bit index the effect
 * table; others encode the blends in their low bits and the coordinates in flags 0x80 (reflection), 0x8 (second layer
 * reflection), and 0x4000 (second set), as wow.export's ShaderMapper reads them
 */
export function batchShader(shader: number, layers: number): { combiner: number; coords: Array<ModelLayer['coords']> } {
  const pad = (coords: Array<ModelLayer['coords']>) => Array.from({ length: layers }, (_, i) => coords[i] ?? coords[coords.length - 1] ?? 'uv')
  if (shader & 0x8000) {
    const effect = effects[shader & 0x7fff]
    if (!effect) return { combiner: combiner('Opaque'), coords: pad(['uv']) }
    // These read every layer from the first coordinates
    const same = ['Mod_Dual_Crossfade', 'Opaque_Mod2xNA_Alpha_Alpha', 'Mod_Masked_Dual_Crossfade'].includes(effect[0])
    return { combiner: combiner(effect[0]), coords: same ? pad(['uv']) : pad(vertexShaders[effect[1]] ?? ['uv']) }
  }
  if (layers <= 1) return { combiner: combiner(shader & 0x70 ? 'Mod' : 'Opaque'), coords: [shader & 0x80 ? 'env' : shader & 0x4000 ? 'uv2' : 'uv'] }
  const coords: Array<ModelLayer['coords']> = shader & 0x80 ? (shader & 0x8 ? ['env', 'env'] : ['env', 'uv']) : shader & 0x8 ? ['uv', 'env'] : shader & 0x4000 ? ['uv', 'uv2'] : ['uv', 'uv']
  const low = shader & 7
  const name: (typeof combiners)[number] = shader & 0x70
    ? low === 3 ? 'Mod_Add' : low === 4 ? 'Mod_Mod2x' : low === 6 ? 'Mod_Mod2xNA' : low === 7 ? 'Mod_AddNA' : 'Mod_Mod'
    : low === 0 ? 'Opaque_Opaque' : low === 3 || low === 7 ? 'Opaque_AddAlpha' : low === 4 ? 'Opaque_Mod2x' : low === 6 ? 'Opaque_Mod2xNA' : 'Opaque_Mod'
  return { combiner: combiner(name), coords: pad(coords) }
}

export type ModelAnimation = { id: number; name: string; duration: number }

/** A value over a particle's life: times run from 0 at birth to 1 at death */
export type LifeTrack = { times: number[]; values: number[] }

/**
 * A particle emitter on a bone. Emission values are keyframed like bones; colour, opacity, size, and the texture cell
 * change over each particle's life
 */
export type ModelEmitter = {
  bone: number
  position: [number, number, number]
  texture: number | null
  /** 0 opaque, 1 alpha key, 2 alpha, 3 and up additive */
  blend: number
  /** 1 a plane, 2 a sphere, 3 a spline, 4 a bone */
  shape: number
  flags: number
  rows: number
  columns: number
  speed: ModelTrack | null
  speedVariation: ModelTrack | null
  verticalRange: ModelTrack | null
  horizontalRange: ModelTrack | null
  /** A vector in model space, three values per key */
  gravity: ModelTrack | null
  lifespan: ModelTrack | null
  lifespanVariation: number
  rate: ModelTrack | null
  rateVariation: number
  areaLength: ModelTrack | null
  areaWidth: ModelTrack | null
  enabled: ModelTrack | null
  /** Red, green, and blue from 0 to 255 */
  color: LifeTrack
  opacity: LifeTrack
  /** Width and height */
  scale: LifeTrack
  cell: LifeTrack
  drag: number
}

export type ModelPart = {
  fileDataId: number
  positions: number[]
  normals: number[]
  uvs: number[]
  /** The second texture coordinates, read by layers that use them */
  uvs2: number[]
  boneIndices: number[]
  boneWeights: number[]
  indices: number[]
  groups: ModelGroup[]
  bones: ModelBone[]
  animations: ModelAnimation[]
  globalLoops: number[]
  attachments: ModelAttachment[]
  opacities: Array<ModelTrack | null>
  colors: Array<{ color: ModelTrack | null; alpha: ModelTrack | null }>
  uvAnimations: Array<{ translation: ModelTrack | null; rotation: ModelTrack | null; scale: ModelTrack | null }>
  /** How many particle emitters the model has */
  particles: number
  /** Its particle emitters, as far as the viewer draws them */
  emitters: ModelEmitter[]
}

export type ItemModel = {
  itemId: number
  /** Parts drawn side by side, such as a pair of shoulders */
  parts: ModelPart[]
}

/** A creature, such as a mount or a battle pet, from its display */
export type CreatureModel = { displayId: number; parts: ModelPart[] }

/**
 * A stand-in character wearing one item: the body with its pieces switched on, the item's textures painted onto the
 * body in the layout's sections, and the item's own models on the body's attachment points
 */
export type DressedModel = {
  body: ModelPart
  /** The body texture's size and where each section sits in it */
  layout: { width: number; height: number; sections: Array<{ section: number; x: number; y: number; width: number; height: number }> }
  /** The default skin and face, painted first: onto a section, or over the whole body when the section is null */
  skin: Array<{ section: number | null; fileDataId: number }>
  /** Painted in order over the skin, each onto its section */
  textures: Array<{ section: number; fileDataId: number }>
  /** The default hair's texture */
  hair: number | null
  /** The cape's texture, when the item is a cloak */
  cape: number | null
  attached: Array<{ part: ModelPart; attachment: number }>
}

export type WornModel = DressedModel & { itemId: number }
export type OutfitModel = DressedModel & { unavailable: AppearanceSlot[] }
export type OutfitModelPiece = { slot: AppearanceSlot; itemId: number | null; modifiedAppearanceId: number | null; appearanceId: number | null }

/** Item kinds and the body pieces they switch on. Each geoset group holds one piece; the item picks it */
const geosetGroups: Record<number, number[]> = {
  4: [8, 10, 13], 5: [8, 10, 13], 20: [8, 10, 13], // shirt, chest, robe: sleeves, undershirt, robe skirt
  6: [18], // waist: belt
  7: [11, 9, 13], // legs: pant legs, kneepads, robe skirt
  8: [5, 20], // feet: boots, feet
  10: [4, 23], // hands: gloves, hands
  16: [15], // back: cape
  19: [12], // tabard
}

/**
 * The bare body of the stand-in, read from the human male model: arms (0), hands (401), feet (501 and 2001), ears
 * (702), legs (1301), waist (1801), torso (2201), and head (3202). Hair and eyes are left off, since the stand-in has no
 * hair or eye textures
 */
export const bareGeosets = [0, 401, 501, 702, 1301, 1801, 2001, 2201, 3202]

/** The body pieces a worn item shows: one per group it sets, replacing the bare piece of that group */
export function wornGeosets(inventoryType: number, geosetGroup: number[], available: Set<number>): number[] {
  return outfitGeosets([{ inventoryType, geosetGroup }], available)
}

/** Later layers win when two pieces cover the same part of the body */
export function outfitGeosets(pieces: Array<{ inventoryType: number; geosetGroup: number[] }>, available: Set<number>): number[] {
  const chosen = new Map(bareGeosets.map(id => [Math.floor(id / 100), id]))
  for (const { inventoryType, geosetGroup } of pieces) {
    for (const [index, group] of (geosetGroups[inventoryType] ?? []).entries()) {
      const value = geosetGroup[index] ?? 0
      if (!value) continue
      const id = group * 100 + 1 + value
      if (available.has(id)) chosen.set(group, id)
    }
  }
  return [...chosen.values()]
}

/** Where each kind of item hangs on the body: the attachment point for each of its models */
export function wornAttachments(inventoryType: number, slot?: AppearanceSlot): number[] {
  if (inventoryType === 1) return [11] // helmet
  if (inventoryType === 3) return [6, 5] // shoulders: left, then right
  if (inventoryType === 14) return [0] // shield
  if (slot === 'offHand' && heldTypes.has(inventoryType)) return [2]
  if (inventoryType === 22 || inventoryType === 23 || inventoryType === 15) return [2] // off-hand and bows, held left
  if ([13, 17, 21, 25, 26].includes(inventoryType)) return [1] // weapons, held right
  return []
}

/** Names for the animations an item model can carry; others show their number */
export const animationNames: Record<number, string> = {
  0: 'Stand', 1: 'Death', 2: 'Spell', 3: 'Stop', 4: 'Walk', 5: 'Run', 6: 'Dead', 7: 'Rise', 8: 'Stand wound', 9: 'Combat wound',
  10: 'Combat critical', 11: 'Shuffle left', 12: 'Shuffle right', 13: 'Walk backwards', 14: 'Stun', 15: 'Hands closed',
  16: 'Unarmed attack', 17: 'One-handed swing', 18: 'Two-handed swing', 19: 'Heavy two-handed swing',
  24: 'Shield block', 25: 'Unarmed ready', 26: 'One-handed ready', 27: 'Two-handed ready', 28: 'Heavy two-handed ready', 29: 'Bow ready',
  37: 'Jump start', 38: 'Jump', 39: 'Jump end', 40: 'Fall', 46: 'Bow shot', 48: 'Rifle ready', 49: 'Rifle shot',
  51: 'Directed spell ready', 52: 'Area spell ready', 53: 'Directed spell cast', 54: 'Area spell cast',
  59: 'Shield bash', 60: 'Talk', 69: 'Dance', 85: 'One-handed thrust', 86: 'Two-handed thrust', 87: 'Off-hand swing',
  88: 'Off-hand thrust', 89: 'Sheathe', 90: 'Hip sheathe', 107: 'Throw', 108: 'Throw ready', 113: 'Area spell cast',
  145: 'Fly', 158: 'Hold', 192: 'Spawn', 195: 'Spell channel directed', 196: 'Spell channel omni',
}

export const animationName = (id: number) => animationNames[id] ?? `Animation ${id}`

/** Item kinds with a model of their own: helmets, shoulders, weapons, shields, and off-hands */
export const ownModelTypes = new Set([1, 3, 13, 14, 15, 17, 21, 22, 23, 25, 26])
/** Item kinds held rather than worn: weapons, shields, and off-hands. Everything else wearable opens on the stand-in */
export const heldTypes = new Set([13, 14, 15, 17, 21, 22, 23, 25, 26])
/** Item kinds a character wears or holds, which the stand-in can show; jewelry and bags are left out */
export const wearableTypes = new Set([1, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 25, 26])

/** Select clips for the held weapon before decoding its skeleton, so the picker stays relevant and the payload stays small */
export function weaponAnimations(inventoryType: number, subclassId: number, slot?: AppearanceSlot): number[] {
  if (inventoryType === 14) return [24, 59]
  if (inventoryType === 23) return []
  if (slot === 'offHand' || inventoryType === 22) return [26, 87, 88]
  if (inventoryType === 15 || subclassId === 2) return [29, 46]
  if (subclassId === 3 || subclassId === 18) return [48, 49]
  if (inventoryType === 25) return [108, 107]
  if (subclassId === 19) return [51, 53]
  if (inventoryType === 17) return [27, 28, 18, 19, 86]
  return heldTypes.has(inventoryType) ? [26, 17, 85] : []
}
