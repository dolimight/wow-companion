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
}

export type ModelAnimation = { id: number; name: string; duration: number }

export type ModelPart = {
  fileDataId: number
  positions: number[]
  normals: number[]
  uvs: number[]
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
  /** Particle emitters the viewer leaves out */
  particles: number
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
export type WornModel = {
  itemId: number
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
  const chosen = new Map(bareGeosets.map(id => [Math.floor(id / 100), id]))
  for (const [slot, group] of (geosetGroups[inventoryType] ?? []).entries()) {
    const value = geosetGroup[slot] ?? 0
    // A value of 0 keeps the bare piece; 1 and up pick the item's piece, such as 1502 for a cape
    if (!value) continue
    const id = group * 100 + 1 + value
    if (available.has(id)) chosen.set(group, id)
  }
  return [...chosen.values()]
}

/** Where each kind of item hangs on the body: the attachment point for each of its models */
export function wornAttachments(inventoryType: number): number[] {
  if (inventoryType === 1) return [11] // helmet
  if (inventoryType === 3) return [6, 5] // shoulders: left, then right
  if (inventoryType === 14) return [0] // shield
  if (inventoryType === 22 || inventoryType === 23 || inventoryType === 15) return [2] // off-hand and bows, held left
  if ([13, 17, 21, 25, 26].includes(inventoryType)) return [1] // weapons, held right
  return []
}

/** Names for the animations an item model can carry; others show their number */
export const animationNames: Record<number, string> = {
  0: 'Stand', 1: 'Death', 2: 'Spell', 3: 'Stop', 4: 'Walk', 5: 'Run', 6: 'Dead', 7: 'Rise', 8: 'Stand wound', 9: 'Combat wound',
  10: 'Combat critical', 11: 'Shuffle left', 12: 'Shuffle right', 13: 'Walk backwards', 14: 'Stun', 15: 'Hands closed',
  16: 'Attack unarmed', 17: 'Attack 1H', 18: 'Attack 2H', 19: 'Attack 2H large', 26: 'Ready unarmed', 27: 'Ready 1H',
  28: 'Ready 2H', 37: 'Jump start', 38: 'Jump', 39: 'Jump end', 40: 'Fall', 51: 'Spell cast directed', 52: 'Spell cast omni',
  53: 'Battle roar', 60: 'Emote talk', 69: 'Emote dance', 113: 'Spell cast area', 120: 'Sheathe', 121: 'Hip sheathe',
  145: 'Fly', 158: 'Hold', 192: 'Spawn', 195: 'Spell channel directed', 196: 'Spell channel omni',
}

export const animationName = (id: number) => animationNames[id] ?? `Animation ${id}`

/** Item kinds with a model of their own: helmets, shoulders, weapons, shields, and off-hands */
export const ownModelTypes = new Set([1, 3, 13, 14, 15, 17, 21, 22, 23, 25, 26])
/** Item kinds a character wears or holds, which the stand-in can show; jewelry and bags are left out */
export const wearableTypes = new Set([1, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 25, 26])
