import type { ModelPart, ModelTrack } from '../../../shared/model'

/**
 * A track's value at a moment: `time` is milliseconds into animation `animation`, and `clock` the milliseconds since
 * the viewer started, which drives values on a global loop. Vectors are interpolated linearly and rotations along the
 * shorter arc. Returns null when the track has no keys for this animation, so the caller keeps the rest value
 */
export function sample(track: ModelTrack | null, animation: number, time: number, clock: number, loops: number[], stride: number): number[] | null {
  if (!track) return null
  const keys = track.global >= 0 ? track.keys[0] : track.keys[animation]
  if (!keys || !keys.times.length) return null
  const length = track.global >= 0 ? loops[track.global] ?? 0 : 0
  const at = track.global >= 0 ? (length > 0 ? clock % length : 0) : time
  const { times, values } = keys
  const value = (index: number) => values.slice(index * stride, index * stride + stride)
  if (times.length === 1 || at <= times[0]!) return value(0)
  const last = times.length - 1
  if (at >= times[last]!) return value(last)
  let index = 0
  while (index < last - 1 && times[index + 1]! <= at) index++
  const from = times[index]!, to = times[index + 1]!
  const f = to > from ? (at - from) / (to - from) : 0
  const a = value(index), b = value(index + 1)
  if (stride === 4) {
    // Rotations: take the shorter way round, then renormalise
    const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!
    const sign = dot < 0 ? -1 : 1
    const out = a.map((entry, c) => entry + (b[c]! * sign - entry) * f)
    const size = Math.hypot(...out) || 1
    return out.map(entry => entry / size)
  }
  return a.map((entry, c) => entry + (b[c]! - entry) * f)
}

/** Every animation the parts carry, once each by game ID, Stand first */
export function animationChoices(parts: Array<{ animations: Array<{ id: number; name: string; duration: number }> }>) {
  const seen = new Map<number, { id: number; name: string; duration: number }>()
  for (const part of parts) for (const animation of part.animations) if (!seen.has(animation.id)) seen.set(animation.id, animation)
  return [...seen.values()].sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : a.id - b.id))
}

/** A missing external clip can have a name and duration but no motion data */
export function bodyAnimationChoices(body: Pick<ModelPart, 'animations' | 'bones'>) {
  return body.animations.filter((clip, index) => clip.id === 0 || body.bones.some(bone =>
    [bone.translation, bone.rotation, bone.scale].some(track => track && track.global < 0 && (track.keys[index]?.times.length ?? 0) > 1)))
}
