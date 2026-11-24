import { AdditiveBlending, BufferAttribute, BufferGeometry, Matrix4, NormalBlending, Points, ShaderMaterial, Vector3, type Object3D, type Texture } from 'three'
import type { LifeTrack, ModelEmitter, ModelTrack } from '../../../shared/model'

/** At most this many live particles per emitter, so a busy effect can't stall the viewer */
const capacity = 400

/** A value over a particle's life at `t` from 0 to 1, interpolated between its keys */
export function lifeAt(track: LifeTrack, t: number, stride: number, fallback: number[]): number[] {
  const { times, values } = track
  if (!times.length) return fallback
  if (t <= times[0]!) return values.slice(0, stride)
  const last = times.length - 1
  if (t >= times[last]!) return values.slice(last * stride, last * stride + stride)
  let i = 0
  while (i < last - 1 && times[i + 1]! <= t) i++
  const f = (t - times[i]!) / Math.max(1e-6, times[i + 1]! - times[i]!)
  return Array.from({ length: stride }, (_, c) => values[i * stride + c]! + (values[(i + 1) * stride + c]! - values[i * stride + c]!) * f)
}

const vertexShader = `
attribute vec4 pcolor;
attribute float psize;
attribute float pcell;
uniform float uScale;
varying vec4 vColor;
varying float vCell;
void main() {
  // Particle colours are written in sRGB; lighting maths runs in linear
  vColor = vec4(pow(pcolor.rgb, vec3(2.2)), pcolor.a);
  vCell = pcell;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize * uScale / max(0.001, -mv.z);
}`

const fragmentShader = `
uniform sampler2D map;
uniform float hasMap;
uniform float rows;
uniform float columns;
uniform float alphaKey;
varying vec4 vColor;
varying float vCell;
void main() {
  float column = mod(vCell, columns);
  float row = floor(vCell / columns);
  vec2 uv = vec2((column + gl_PointCoord.x) / columns, (row + gl_PointCoord.y) / rows);
  vec4 colour = (hasMap > 0.5 ? texture2D(map, uv) : vec4(1.0)) * vColor;
  if (alphaKey > 0.5 && colour.a < 0.5) discard;
  if (colour.a < 0.003) discard;
  gl_FragColor = colour;
  #include <colorspace_fragment>
}`

type Sampler = (track: ModelTrack | null, stride: number) => number[] | null

/**
 * One emitter's particles, simulated on the CPU in world space and drawn as camera-facing points. Spawn values follow
 * the emitter's keyframes; colour, opacity, size, and texture cell follow each particle's life
 */
export class ParticleEmitter {
  readonly points: Points
  private positions = new Float32Array(capacity * 3)
  private colors = new Float32Array(capacity * 4)
  private sizes = new Float32Array(capacity)
  private cells = new Float32Array(capacity)
  private velocity = new Float32Array(capacity * 3)
  private age = new Float32Array(capacity)
  private life = new Float32Array(capacity)
  private alive = 0
  private pending = 0
  private material: ShaderMaterial

  constructor(private emitter: ModelEmitter, private bone: Object3D, private pivot: [number, number, number], map: Texture | null) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    geometry.setAttribute('pcolor', new BufferAttribute(this.colors, 4))
    geometry.setAttribute('psize', new BufferAttribute(this.sizes, 1))
    geometry.setAttribute('pcell', new BufferAttribute(this.cells, 1))
    geometry.setDrawRange(0, 0)
    const additive = emitter.blend >= 3
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: { map: { value: map }, hasMap: { value: map ? 1 : 0 }, rows: { value: emitter.rows }, columns: { value: emitter.columns }, alphaKey: { value: emitter.blend === 1 ? 1 : 0 }, uScale: { value: 500 } },
      transparent: emitter.blend >= 2,
      depthWrite: emitter.blend < 2,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2000
  }

  /** Pixels per world unit at distance one, so sizes in model units read the same at any zoom */
  setScale(pixels: number) { this.material.uniforms.uScale!.value = pixels }

  /** Moves every particle on by `dt` seconds and spawns new ones from the emitter's bone */
  update(dt: number, at: Sampler, modelToWorld: Matrix4, worldScale: number) {
    if (dt <= 0) return
    const e = this.emitter
    const first = (track: ModelTrack | null, fallback: number) => at(track, 1)?.[0] ?? fallback
    const enabled = first(e.enabled, 1) > 0
    if (enabled) {
      const rate = Math.max(0, first(e.rate, 0) + Math.random() * e.rateVariation * 0.5)
      this.pending = Math.min(this.pending + Math.min(rate, 200) * dt, capacity)
      const spawn = new Vector3(), direction = new Vector3(), world = new Matrix4().copy(this.bone.matrixWorld)
      while (this.pending >= 1 && this.alive < capacity) {
        this.pending -= 1
        const length = first(e.areaLength, 0), width = first(e.areaWidth, 0)
        if (e.shape === 2) {
          // A sphere throws particles outward from a random point inside it
          direction.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
          spawn.copy(direction).multiplyScalar(length * Math.random())
        } else {
          const vertical = first(e.verticalRange, 0), horizontal = first(e.horizontalRange, 0)
          const polar = (Math.random() * 2 - 1) * vertical, azimuth = (Math.random() * 2 - 1) * horizontal
          spawn.set((Math.random() - 0.5) * length, (Math.random() - 0.5) * width, 0)
          direction.set(Math.sin(polar) * Math.cos(azimuth), Math.sin(polar) * Math.sin(azimuth), Math.cos(polar))
        }
        // The emitter sits in model space; the bone's matrix carries it from the bone's pivot to the world
        spawn.add(new Vector3(e.position[0] - this.pivot[0], e.position[1] - this.pivot[1], e.position[2] - this.pivot[2])).applyMatrix4(world)
        const speed = first(e.speed, 0) * (1 + (Math.random() * 2 - 1) * first(e.speedVariation, 0))
        direction.transformDirection(world).multiplyScalar(speed * worldScale)
        const i = this.alive++
        this.positions.set([spawn.x, spawn.y, spawn.z], i * 3)
        this.velocity.set([direction.x, direction.y, direction.z], i * 3)
        this.age[i] = 0
        this.life[i] = Math.max(0.05, first(e.lifespan, 1) * (1 + (Math.random() * 2 - 1) * e.lifespanVariation))
      }
    }
    // Gravity is a vector in model space; turn it with the model and keep its strength
    const gravity = new Vector3(...(at(e.gravity, 3) ?? [0, 0, 0]))
    const strength = gravity.length()
    const pull = strength ? gravity.transformDirection(modelToWorld).multiplyScalar(strength * worldScale) : gravity
    const slow = e.drag > 0 ? Math.max(0, 1 - e.drag * dt) : 1
    for (let i = 0; i < this.alive;) {
      this.age[i]! += dt
      if (this.age[i]! >= this.life[i]!) { this.remove(i); continue }
      const t = this.age[i]! / this.life[i]!
      for (let c = 0; c < 3; c++) {
        this.velocity[i * 3 + c] = (this.velocity[i * 3 + c]! + pull.getComponent(c) * dt) * slow
        this.positions[i * 3 + c]! += this.velocity[i * 3 + c]! * dt
      }
      const color = lifeAt(e.color, t, 3, [255, 255, 255])
      this.colors.set([color[0]! / 255, color[1]! / 255, color[2]! / 255, lifeAt(e.opacity, t, 1, [1])[0]!], i * 4)
      const scale = lifeAt(e.scale, t, 2, [0.1, 0.1])
      this.sizes[i] = Math.max(scale[0]!, scale[1]!) * worldScale
      this.cells[i] = Math.round(lifeAt(e.cell, t, 1, [0])[0]!)
      i++
    }
    const geometry = this.points.geometry
    geometry.setDrawRange(0, this.alive)
    for (const name of ['position', 'pcolor', 'psize', 'pcell']) (geometry.getAttribute(name) as BufferAttribute).needsUpdate = true
  }

  /** Swaps the last live particle into slot `i` */
  private remove(i: number) {
    const last = --this.alive
    if (i === last) return
    this.positions.copyWithin(i * 3, last * 3, last * 3 + 3)
    this.velocity.copyWithin(i * 3, last * 3, last * 3 + 3)
    this.colors.copyWithin(i * 4, last * 4, last * 4 + 4)
    this.sizes[i] = this.sizes[last]!
    this.cells[i] = this.cells[last]!
    this.age[i] = this.age[last]!
    this.life[i] = this.life[last]!
  }

  dispose() { this.points.geometry.dispose(); this.material.dispose() }
}
