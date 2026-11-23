/**
 * Reads the game's M2 models and their .skin, .skel, and .anim companions into the viewer's model
 * (src/shared/model.ts). Layouts follow the wowdev.wiki M2, SKIN, and SKEL pages and wow.export's M2 loader (MIT,
 * Kruithne and Marlamin). Only what the viewer draws is read: geometry, textures, bones with their keyframes,
 * attachment points, texture weights, colours, and texture scrolling. Particles and ribbons are counted but not read
 */
import { animationName, type ModelAnimation, type ModelAttachment, type ModelBone, type ModelGroup, type ModelPart, type ModelTrack } from '../../shared/model'

type Chunks = Record<string, Buffer>
const chunks = (buffer: Buffer): Chunks => {
  const out: Chunks = {}
  for (let at = 0; at + 8 <= buffer.length;) {
    const magic = buffer.toString('ascii', at, at + 4)
    if (!/^[A-Z0-9]{4}$/.test(magic)) break
    const size = buffer.readUInt32LE(at + 4)
    out[magic] = buffer.subarray(at + 8, at + 8 + size)
    at += 8 + size
  }
  return out
}
const u32s = (data: Buffer | undefined) => data ? Array.from({ length: Math.floor(data.length / 4) }, (_, i) => data.readUInt32LE(i * 4)) : []
const animFileList = (data: Buffer | undefined) => {
  const out: Array<{ id: number; sub: number; fileDataId: number }> = []
  if (data) for (let i = 0; i + 8 <= data.length; i += 8) out.push({ id: data.readUInt16LE(i), sub: data.readUInt16LE(i + 2), fileDataId: data.readUInt32LE(i + 4) })
  return out
}

/** A chunked M2's parts: the model data and the file IDs of its skins, textures, external animations, and skeleton */
export type M2File = { md20: Buffer; skins: number[]; textures: number[]; animFiles: Array<{ id: number; sub: number; fileDataId: number }>; skeleton: number | null }

export function readM2File(buffer: Buffer): M2File {
  if (buffer.toString('ascii', 0, 4) === 'MD20') return { md20: buffer, skins: [], textures: [], animFiles: [], skeleton: null }
  const found = chunks(buffer)
  const md20 = found.MD21 ?? Buffer.alloc(0)
  if (md20.toString('ascii', 0, 4) !== 'MD20') throw new Error('Not a game model')
  return { md20, skins: u32s(found.SFID), textures: u32s(found.TXID), animFiles: animFileList(found.AFID), skeleton: found.SKID ? found.SKID.readUInt32LE(0) : null }
}

/** A .skel file: bones, sequences, and attachments each in their own chunk, with offsets inside that chunk */
export type SkelFile = { bones: Buffer | null; sequences: Buffer | null; attachments: Buffer | null; animFiles: Array<{ id: number; sub: number; fileDataId: number }>; parent: number | null }

export function readSkelFile(buffer: Buffer): SkelFile {
  const found = chunks(buffer)
  return { bones: found.SKB1 ?? null, sequences: found.SKS1 ?? null, attachments: found.SKA1 ?? null, animFiles: animFileList(found.AFID), parent: found.SKPD && found.SKPD.length >= 12 ? found.SKPD.readUInt32LE(8) || null : null }
}

/** A .anim file's keyframe data: the bone chunk for a skeleton, the AFM2 chunk for a model, or the whole file when unchunked */
export function readAnimFile(buffer: Buffer, skeleton = false): Buffer {
  const found = chunks(buffer)
  return (skeleton ? found.AFSB ?? found.AFM2 : found.AFM2 ?? found.AFSB) ?? buffer
}

type Skin = { vertices: number[]; indices: number[]; sections: Array<{ id: number; indexStart: number; indexCount: number }>; batches: Array<{ priority: number; section: number; color: number; material: number; layer: number; textureCombo: number; weightCombo: number; transformCombo: number }> }

export function readSkin(buffer: Buffer): Skin {
  if (buffer.toString('ascii', 0, 4) !== 'SKIN') throw new Error('Not a model skin')
  const array = (at: number) => ({ count: buffer.readUInt32LE(at), offset: buffer.readUInt32LE(at + 4) })
  const u16s = ({ count, offset }: { count: number; offset: number }) => Array.from({ length: count }, (_, i) => buffer.readUInt16LE(offset + i * 2))
  const sections = array(28), batches = array(36)
  return {
    vertices: u16s(array(4)),
    indices: u16s(array(12)),
    sections: Array.from({ length: sections.count }, (_, i) => {
      const at = sections.offset + i * 48
      // The level holds the high part of the index start in large models
      return { id: buffer.readUInt16LE(at), indexStart: buffer.readUInt16LE(at + 8) + (buffer.readUInt16LE(at + 2) << 16), indexCount: buffer.readUInt16LE(at + 10) }
    }),
    batches: Array.from({ length: batches.count }, (_, i) => {
      const at = batches.offset + i * 24
      return { priority: buffer.readInt8(at + 1), section: buffer.readUInt16LE(at + 4), color: buffer.readUInt16LE(at + 8), material: buffer.readUInt16LE(at + 10), layer: buffer.readUInt16LE(at + 12), textureCombo: buffer.readUInt16LE(at + 16), weightCombo: buffer.readUInt16LE(at + 20), transformCombo: buffer.readUInt16LE(at + 22) }
    }),
  }
}

const none = 0xffff
const round = (value: number) => Math.round(value * 1e5) / 1e5
const fixed16 = (value: number) => value / 32767
const compressed = (value: number) => (value < 0 ? value + 32768 : value - 32767) / 32767

type Kind = 'vec3' | 'quat' | 'compQuat' | 'fixed16'
const kinds: Record<Kind, { size: number; count: number }> = { vec3: { size: 12, count: 3 }, quat: { size: 16, count: 4 }, compQuat: { size: 8, count: 4 }, fixed16: { size: 2, count: 1 } }
type Kept = Array<{ index: number; animation: ModelAnimation }>

/** The first variation of each animation, following aliases to the sequence that holds the data */
function readSequences(buffer: Buffer, at: number, maxAnimations: number, only?: number[]) {
  const count = buffer.readUInt32LE(at), offset = buffer.readUInt32LE(at + 4)
  const raw = Array.from({ length: count }, (_, i) => {
    const base = offset + i * 64
    return { id: buffer.readUInt16LE(base), variation: buffer.readUInt16LE(base + 2), duration: buffer.readUInt32LE(base + 4), flags: buffer.readUInt32LE(base + 12), alias: buffer.readUInt16LE(base + 62) }
  })
  const kept: Kept = []
  // Stand comes first, so it is kept however many animations the model has
  const order = [...raw.entries()].sort(([, a], [, b]) => Number(b.id === 0) - Number(a.id === 0))
  for (const [index, sequence] of order) {
    if (sequence.variation !== 0 || kept.some(entry => entry.animation.id === sequence.id) || kept.length >= maxAnimations || (only && !only.includes(sequence.id))) continue
    let source = index
    for (let guard = 0; raw[source] && raw[source]!.flags & 0x40 && guard < 8; guard++) source = raw[source]!.alias
    kept.push({ index: source, animation: { id: sequence.id, name: animationName(sequence.id), duration: raw[source]?.duration || sequence.duration } })
  }
  return { raw, kept }
}

/** Which kept sequences keep their keyframes in .anim files, and the file for each */
function externalFiles(raw: ReturnType<typeof readSequences>['raw'], kept: Kept, files: Array<{ id: number; sub: number; fileDataId: number }>) {
  return kept.flatMap(({ index }) => {
    const sequence = raw[index]
    if (!sequence || sequence.flags & 0x20) return []
    const entry = files.find(file => file.id === sequence.id && file.sub === sequence.variation)
    return entry?.fileDataId ? [{ index, fileDataId: entry.fileDataId }] : []
  })
}

/** Reads one keyframed value. Headers live in `buffer`; keys of an external sequence live in its .anim data */
function trackReader(buffer: Buffer, kept: Kept, external: (index: number) => boolean, anims: Map<number, Buffer>) {
  return (at: number, kind: Kind): ModelTrack | null => {
    const global = buffer.readInt16LE(at + 2)
    const timesCount = buffer.readUInt32LE(at + 4), timesOffset = buffer.readUInt32LE(at + 8)
    const valuesCount = buffer.readUInt32LE(at + 12), valuesOffset = buffer.readUInt32LE(at + 16)
    if (!timesCount || !valuesCount) return null
    const { size, count } = kinds[kind]
    const read = (index: number) => {
      if (index >= timesCount || index >= valuesCount) return null
      const source = external(index) && global < 0 ? anims.get(index) : buffer
      if (!source) return null
      const t = { count: buffer.readUInt32LE(timesOffset + index * 8), offset: buffer.readUInt32LE(timesOffset + index * 8 + 4) }
      const v = { count: buffer.readUInt32LE(valuesOffset + index * 8), offset: buffer.readUInt32LE(valuesOffset + index * 8 + 4) }
      const keys = Math.min(t.count, v.count)
      if (!keys || t.offset + keys * 4 > source.length || v.offset + keys * size > source.length) return null
      const out = { times: [] as number[], values: [] as number[] }
      for (let k = 0; k < keys; k++) {
        out.times.push(source.readUInt32LE(t.offset + k * 4))
        const base = v.offset + k * size
        for (let c = 0; c < count; c++) {
          out.values.push(round(kind === 'vec3' || kind === 'quat' ? source.readFloatLE(base + c * 4) : kind === 'compQuat' ? compressed(source.readInt16LE(base + c * 2)) : fixed16(source.readInt16LE(base))))
        }
      }
      return out
    }
    const keys = global >= 0 ? [read(0)] : kept.map(entry => read(entry.index))
    return keys.some(Boolean) ? { global, keys } : null
  }
}

function readBones(buffer: Buffer, at: number, track: ReturnType<typeof trackReader>): ModelBone[] {
  const count = buffer.readUInt32LE(at), offset = buffer.readUInt32LE(at + 4)
  return Array.from({ length: count }, (_, i) => {
    const base = offset + i * 88
    return {
      parent: buffer.readInt16LE(base + 8),
      billboard: (buffer.readUInt32LE(base + 4) & 0x78) !== 0,
      translation: track(base + 16, 'vec3'),
      rotation: track(base + 36, 'compQuat'),
      scale: track(base + 56, 'vec3'),
      pivot: [round(buffer.readFloatLE(base + 76)), round(buffer.readFloatLE(base + 80)), round(buffer.readFloatLE(base + 84))],
    }
  })
}

function readAttachments(buffer: Buffer, at: number): ModelAttachment[] {
  const count = buffer.readUInt32LE(at), offset = buffer.readUInt32LE(at + 4)
  return Array.from({ length: count }, (_, i) => {
    const base = offset + i * 40
    return { id: buffer.readUInt32LE(base), bone: buffer.readUInt16LE(base + 4), position: [round(buffer.readFloatLE(base + 8)), round(buffer.readFloatLE(base + 12)), round(buffer.readFloatLE(base + 16))] }
  })
}

/** Everything the reader needs from outside the model file: its skin, textures, and the animation files it names */
export type M2Sources = {
  skin: Buffer
  textureFor: (type: number, txid: number) => number | null
  /** Loads an .anim or .skel file by its file data ID */
  file: (fileDataId: number) => Promise<Buffer>
  /** Only these geosets are kept, with the vertices they use; all of them when absent */
  geosets?: Set<number>
  maxAnimations?: number
  /** Only these animations, by game ID; the first ones the model has when absent */
  animations?: number[]
}

/**
 * Reads an M2 model with one of its skins. Item textures come from the item's display rather than the model, so
 * `textureFor` turns each texture's type and TXID file into the file to draw. A model with a skeleton file, as
 * characters have, takes its bones, animations, and attachment points from it
 */
export async function readM2(file: M2File, fileDataId: number, sources: M2Sources): Promise<ModelPart> {
  const md20 = file.md20
  const maxAnimations = sources.maxAnimations ?? 16
  const array = (at: number) => ({ count: md20.readUInt32LE(at), offset: md20.readUInt32LE(at + 4) })
  const u16s = (at: number) => { const { count, offset } = array(at); return Array.from({ length: count }, (_, i) => md20.readUInt16LE(offset + i * 2)) }
  const loadAnims = async (wanted: Array<{ index: number; fileDataId: number }>, skeleton: boolean) => {
    const out = new Map<number, Buffer>()
    for (const entry of wanted) { try { out.set(entry.index, readAnimFile(await sources.file(entry.fileDataId), skeleton)) } catch { /* that animation stays still */ } }
    return out
  }

  // The model's own sequences drive its colours, weights, and texture scrolling
  const own = readSequences(md20, 28, maxAnimations, file.skeleton ? undefined : sources.animations)
  const ownAnims = await loadAnims(externalFiles(own.raw, own.kept, file.animFiles), false)
  const ownTrack = trackReader(md20, own.kept, index => !((own.raw[index]?.flags ?? 0x20) & 0x20), ownAnims)

  let bones = readBones(md20, 44, ownTrack)
  let animations = own.kept.map(entry => entry.animation)
  let attachments = readAttachments(md20, 240)
  const globals = array(20)
  let globalLoops = Array.from({ length: globals.count }, (_, i) => md20.readUInt32LE(globals.offset + i * 4))
  if (file.skeleton) {
    const skel = readSkelFile(await sources.file(file.skeleton))
    // A skeleton can borrow its sequences from a parent skeleton
    const parent = skel.parent && !skel.sequences ? readSkelFile(await sources.file(skel.parent)) : null
    const sequenceChunk = skel.sequences ?? parent?.sequences ?? null
    if (skel.bones && sequenceChunk) {
      const sequences = readSequences(sequenceChunk, 8, maxAnimations, sources.animations)
      const anims = await loadAnims(externalFiles(sequences.raw, sequences.kept, skel.animFiles.length ? skel.animFiles : parent?.animFiles ?? []), true)
      bones = readBones(skel.bones, 0, trackReader(skel.bones, sequences.kept, index => !((sequences.raw[index]?.flags ?? 0x20) & 0x20), anims))
      animations = sequences.kept.map(entry => entry.animation)
      globalLoops = Array.from({ length: sequenceChunk.readUInt32LE(0) }, (_, i) => sequenceChunk.readUInt32LE(sequenceChunk.readUInt32LE(4) + i * 4))
    }
    if (skel.attachments) attachments = readAttachments(skel.attachments, 0)
  }

  const skin = readSkin(sources.skin)
  const wanted = sources.geosets
  const sections = skin.sections.map(section => ({ ...section, keep: !wanted || wanted.has(section.id) }))
  // Keep only the vertices the kept geosets draw, renumbered
  const used = new Map<number, number>()
  const order: number[] = []
  const indices: number[] = []
  const starts = new Map<number, number>()
  for (const [i, section] of sections.entries()) {
    if (!section.keep) continue
    starts.set(i, indices.length)
    for (let k = section.indexStart; k < section.indexStart + section.indexCount; k++) {
      const local = skin.indices[k]!
      let mapped = used.get(local)
      if (mapped == null) { mapped = order.length; used.set(local, mapped); order.push(local) }
      indices.push(mapped)
    }
  }

  const vertices = array(60)
  const part: ModelPart = {
    fileDataId, positions: [], normals: [], uvs: [], boneIndices: [], boneWeights: [], indices, groups: [], bones,
    animations, globalLoops, attachments, opacities: [], colors: [], uvAnimations: [], particles: md20.readUInt32LE(296),
  }
  for (const local of order) {
    const at = vertices.offset + skin.vertices[local]! * 48
    for (let c = 0; c < 3; c++) part.positions.push(round(md20.readFloatLE(at + c * 4)))
    for (let c = 0; c < 4; c++) part.boneWeights.push(md20.readUInt8(at + 12 + c) / 255)
    for (let c = 0; c < 4; c++) part.boneIndices.push(md20.readUInt8(at + 16 + c))
    for (let c = 0; c < 3; c++) part.normals.push(round(md20.readFloatLE(at + 20 + c * 4)))
    for (let c = 0; c < 2; c++) part.uvs.push(round(md20.readFloatLE(at + 32 + c * 4)))
  }

  const colors = array(72)
  part.colors = Array.from({ length: colors.count }, (_, i) => ({ color: ownTrack(colors.offset + i * 40, 'vec3'), alpha: ownTrack(colors.offset + i * 40 + 20, 'fixed16') }))
  const weights = array(88)
  part.opacities = Array.from({ length: weights.count }, (_, i) => ownTrack(weights.offset + i * 20, 'fixed16'))
  const transforms = array(96)
  part.uvAnimations = Array.from({ length: transforms.count }, (_, i) => ({ translation: ownTrack(transforms.offset + i * 60, 'vec3'), rotation: ownTrack(transforms.offset + i * 60 + 20, 'quat'), scale: ownTrack(transforms.offset + i * 60 + 40, 'vec3') }))

  const textures = array(80)
  const textureInfo = Array.from({ length: textures.count }, (_, i) => {
    const type = md20.readUInt32LE(textures.offset + i * 16)
    return { type, file: sources.textureFor(type, file.textures[i] ?? 0), flags: md20.readUInt32LE(textures.offset + i * 16 + 4) }
  })
  const materials = array(112)
  const textureLookup = u16s(128), weightLookup = u16s(144), transformLookup = u16s(152)
  part.groups = skin.batches.flatMap((batch): ModelGroup[] => {
    const section = sections[batch.section]
    const start = starts.get(batch.section)
    if (!section || !section.keep || start == null || !section.indexCount) return []
    const texture = textureInfo[textureLookup[batch.textureCombo] ?? -1]
    const material = batch.material < materials.count ? materials.offset + batch.material * 4 : -1
    const weight = weightLookup[batch.weightCombo]
    const transform = batch.transformCombo === none ? undefined : transformLookup[batch.transformCombo]
    return [{
      start,
      count: section.indexCount,
      geoset: section.id,
      texture: texture?.file ?? null,
      textureType: texture?.type ?? 0,
      wrap: texture?.flags ?? 0,
      flags: material >= 0 ? md20.readUInt16LE(material) : 0,
      blend: material >= 0 ? md20.readUInt16LE(material + 2) : 0,
      opacity: weight != null && weight !== none && weight < part.opacities.length ? weight : null,
      color: batch.color !== none && batch.color < part.colors.length ? batch.color : null,
      uvAnimation: transform != null && transform !== none && transform < part.uvAnimations.length ? transform : null,
      order: batch.priority * 16 + batch.layer,
    }]
  })
  return part
}
