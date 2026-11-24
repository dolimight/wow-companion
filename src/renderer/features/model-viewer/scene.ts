import {
  AdditiveBlending, AmbientLight, Bone, Box3, BufferAttribute, BufferGeometry, Clock, Color, CustomBlending, DirectionalLight, DoubleSide, DstColorFactor, FrontSide,
  Group, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OneFactor, OneMinusSrcAlphaFactor, PerspectiveCamera, Quaternion, RepeatWrapping, ClampToEdgeWrapping,
  Scene, Skeleton, SkinnedMesh, SRGBColorSpace, SrcColorFactor, Texture, TextureLoader, Vector3, WebGLRenderer, ZeroFactor, type Material,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CanvasTexture } from 'three'
import type { CreatureModel, DressedModel, ItemModel, ModelGroup, ModelPart } from '../../../shared/model'

/** What the viewer shows: an item's own models, a creature, or a stand-in character wearing an item */
export type ViewSubject = { kind: 'item'; model: ItemModel } | { kind: 'creature'; model: CreatureModel } | { kind: 'worn'; model: DressedModel }

/** The stand-in's skin before its textures arrive, and wherever the game's default skin leaves a gap */
const mannequinSkin = '#a8998c'
import { sample } from './animate'
import { ParticleEmitter } from './particles'
import { applyCombiner, type CombinerUniforms } from './combiners'
import { DataTexture } from 'three'

type Draw = { mesh: Mesh; material: MeshBasicMaterial | MeshLambertMaterial; group: ModelGroup; texture: Texture | null; extra: Array<Texture | null>; uniforms: CombinerUniforms | null }
type Built = { part: ModelPart; bones: Bone[]; draws: Draw[]; root: Group; emitters: ParticleEmitter[] }

/** The game's blend mode as a three.js material setup */
function blending(material: Material, group: ModelGroup) {
  const { blend } = group
  if (blend === 1) material.alphaTest = 224 / 255
  if (blend >= 2) { material.transparent = true; material.depthWrite = false }
  if (blend === 3 || blend === 4) material.blending = AdditiveBlending
  if (blend === 5) Object.assign(material, { blending: CustomBlending, blendSrc: DstColorFactor, blendDst: ZeroFactor })
  if (blend === 6) Object.assign(material, { blending: CustomBlending, blendSrc: DstColorFactor, blendDst: SrcColorFactor })
  if (blend === 7) Object.assign(material, { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor })
  material.side = group.flags & 0x4 ? DoubleSide : FrontSide
  if (group.flags & 0x8) material.depthTest = false
  if (group.flags & 0x10) material.depthWrite = false
}

/**
 * Draws an item model with three.js: each part as skinned meshes on its own skeleton, keyframes played by the
 * viewer's clock, glows turned to the camera, and textures scrolled as the game does. The game is Z up and faces +X, so
 * the model is turned upright and toward the camera
 */
export class ItemModelScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.01, 200)
  private controls: OrbitControls
  private clock = new Clock()
  private built: Built[] = []
  private textures = new Map<number, Texture>()
  /** Copies of each texture made before its picture arrived, refreshed when it does */
  private copies = new Map<number, Texture[]>()
  /** Textures the scene made itself, such as the painted skin */
  private ownTextures: Texture[] = []
  /** A clear white pixel for combiner layers the item leaves empty, such as enchant glows: it adds no light, mixes nothing in, and multiplies by one */
  private blank = (() => { const made = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1); made.needsUpdate = true; return made })()
  private frame = 0
  private elapsed = 0
  private time = 0
  private animationId: number | null = 0
  /** Seconds since the last frame while playing, which moves the particles on */
  private step = 0
  private upright = new Group()
  private readonly frameWeaponMotion: boolean
  playing = true

  /** Pictures still on their way; a snapshot waits for them */
  private loading: Array<Promise<unknown>> = []
  private ownsRenderer: boolean

  /**
   * With `options.renderer` the scene draws through a renderer it shares and doesn't run its own loop or controls, as
   * the tile snapshots do; `options.background` sets the colour behind the model
   */
  constructor(private canvas: HTMLCanvasElement, subject: ViewSubject, textureUrl: (fileDataId: number) => string | null, options: { renderer?: WebGLRenderer; background?: string } = {}) {
    // An opaque background: the game keeps masks in the alpha of solid textures, which a see-through one would show
    this.ownsRenderer = !options.renderer
    this.frameWeaponMotion = this.ownsRenderer && subject.kind === 'worn' && subject.model.attached.some(entry => entry.attachment <= 2)
    this.renderer = options.renderer ?? new WebGLRenderer({ canvas, antialias: true })
    this.scene.background = new Color(options.background ?? (getComputedStyle(canvas.parentElement ?? canvas).backgroundColor || '#1c1c1e'))
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.scene.add(new AmbientLight(0xffffff, 1.6))
    const sun = new DirectionalLight(0xffffff, 2.2)
    sun.position.set(3, 5, 4)
    this.scene.add(sun)
    const fill = new DirectionalLight(0xbfd4ff, 0.8)
    fill.position.set(-4, 1, -3)
    this.scene.add(fill)

    const upright = this.upright
    upright.rotation.set(-Math.PI / 2, 0, 0)
    const facing = new Group()
    facing.rotation.set(0, -Math.PI / 2, 0)
    facing.add(upright)
    this.scene.add(facing)
    const loader = new TextureLoader()
    const texture = (id: number) => {
      let found = this.textures.get(id)
      if (!found) {
        const url = textureUrl(id)
        if (!url) return null
        let done = () => {}
        this.loading.push(new Promise<void>(resolve => { done = resolve }))
        found = loader.load(url, () => { for (const copy of this.copies.get(id) ?? []) copy.needsUpdate = true; done() }, undefined, () => done())
        found.colorSpace = SRGBColorSpace
        found.flipY = false
        this.textures.set(id, found)
      }
      return found
    }

    if (subject.kind === 'worn') this.dress(subject.model, upright, texture, textureUrl)
    else {
      let offset = 0
      for (const part of subject.model.parts) {
        const built = this.build(part, texture)
        // Parts sit side by side along the model's own Y axis, which faces across the screen
        const box = new Box3().setFromObject(built.root)
        const width = box.max.y - box.min.y
        if (this.built.length) built.root.position.y = offset - box.min.y + width * 0.1
        offset = built.root.position.y + box.max.y
        upright.add(built.root)
        this.built.push(built)
      }
    }
    this.pose()
    if (subject.kind === 'item') this.layFlat(facing)

    this.controls = new OrbitControls(this.camera, options.renderer ? document.createElement('div') : canvas)
    this.controls.enableDamping = true
    this.controls.autoRotateSpeed = 1.6
    if (this.ownsRenderer) this.resize()
    this.fit()
    if (this.ownsRenderer) {
      const loop = () => { this.frame = requestAnimationFrame(loop); this.tick() }
      loop()
    }
  }

  /** Moves the animation, particles, and turning on by `delta` milliseconds, for a scene drawn by someone else's loop */
  advance(delta: number) {
    const step = Math.min(delta, 100)
    if (this.playing) { this.elapsed += step; this.time += step }
    this.step = this.playing ? step / 1000 : 0
    this.pose()
    this.controls.update()
  }

  /**
   * Draws into one tile of a shared canvas: `rect` is the tile and `clip` the part of the page it may show in, both in
   * CSS pixels from the top left; `height` is the canvas height
   */
  renderViewport(rect: { left: number; top: number; width: number; height: number }, clip: { left: number; top: number; right: number; bottom: number }, height: number) {
    const aspect = rect.width / Math.max(1, rect.height)
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix() }
    const pixels = (rect.height * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    for (const { emitters } of this.built) for (const emitter of emitters) emitter.setScale(pixels)
    const left = Math.max(rect.left, clip.left), top = Math.max(rect.top, clip.top)
    const right = Math.min(rect.left + rect.width, clip.right), bottom = Math.min(rect.top + rect.height, clip.bottom)
    if (right <= left || bottom <= top) return
    this.renderer.setViewport(rect.left, height - rect.top - rect.height, rect.width, rect.height)
    this.renderer.setScissor(left, height - bottom, right - left, bottom - top)
    this.renderer.render(this.scene, this.camera)
  }

  /** Resolves once every texture has arrived or failed */
  async ready() { await Promise.all(this.loading) }

  /** Draws one frame through the shared renderer at its size, for a snapshot */
  renderOnce(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.fit()
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * The stand-in body with the item's textures painted onto its skin, section by section, and the item's models hung on
   * the body's attachment points so they follow its animations
   */
  private dress(model: DressedModel, upright: Group, texture: (id: number) => Texture | null, textureUrl: (fileDataId: number) => string | null) {
    const canvas = document.createElement('canvas')
    canvas.width = model.layout.width
    canvas.height = model.layout.height
    const context = canvas.getContext('2d')!
    context.fillStyle = mannequinSkin
    context.fillRect(0, 0, canvas.width, canvas.height)
    const skin = new CanvasTexture(canvas)
    skin.colorSpace = SRGBColorSpace
    skin.flipY = false
    this.ownTextures.push(skin)
    // Paint in order once every picture has arrived: the default skin and face, then the item over them
    const layers = [...model.skin, ...model.textures]
    let painted = () => {}
    this.loading.push(new Promise<void>(resolve => { painted = resolve }))
    const pictures = layers.map(entry => new Promise<HTMLImageElement | null>(resolve => {
      const url = textureUrl(entry.fileDataId)
      if (!url) return resolve(null)
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = url
    }))
    void Promise.all(pictures).then(images => {
      images.forEach((image, i) => {
        const wanted = layers[i]!.section
        const section = wanted == null ? { x: 0, y: 0, width: canvas.width, height: canvas.height } : model.layout.sections.find(entry => entry.section === wanted)
        if (image && section) context.drawImage(image, section.x, section.y, section.width, section.height)
      })
      skin.needsUpdate = true
      painted()
    })
    const body = this.build(model.body, texture, group => group.textureType === 1 ? skin : null)
    upright.add(body.root)
    this.built.push(body)
    for (const { part, attachment } of model.attached) {
      const point = model.body.attachments.find(entry => entry.id === attachment)
      const bone = point ? body.bones[point.bone] : undefined
      if (!point || !bone) continue
      const pivot = model.body.bones[point.bone]!.pivot
      const holder = new Group()
      holder.position.set(point.position[0] - pivot[0], point.position[1] - pivot[1], point.position[2] - pivot[2])
      bone.add(holder)
      const built = this.build(part, texture)
      holder.add(built.root)
      this.built.push(built)
    }
  }

  private build(part: ModelPart, texture: (id: number) => Texture | null, special?: (group: ModelGroup) => Texture | null): Built {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(part.positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(part.normals), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(part.uvs), 2))
    const second = new BufferAttribute(new Float32Array(part.uvs2.length ? part.uvs2 : part.uvs), 2)
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(part.boneIndices), 4))
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(part.boneWeights), 4))
    const index = new BufferAttribute(part.positions.length / 3 > 65535 ? new Uint32Array(part.indices) : new Uint16Array(part.indices), 1)
    geometry.setIndex(index)

    const bones = part.bones.map(() => new Bone())
    const inverses = part.bones.map(bone => new Matrix4().makeTranslation(-bone.pivot[0], -bone.pivot[1], -bone.pivot[2]))
    const root = new Group()
    part.bones.forEach((bone, i) => {
      const parent = part.bones[bone.parent]
      bones[i]!.position.set(bone.pivot[0] - (parent?.pivot[0] ?? 0), bone.pivot[1] - (parent?.pivot[1] ?? 0), bone.pivot[2] - (parent?.pivot[2] ?? 0))
      const owner = bone.parent >= 0 && bone.parent < bones.length ? bones[bone.parent]! : root
      owner.add(bones[i]!)
    })
    const skeleton = bones.length ? new Skeleton(bones, inverses) : null

    const copy = (id: number | null) => {
      const base = id ? texture(id) : null
      if (!base || !id) return null
      const made = base.clone()
      this.copies.set(id, [...(this.copies.get(id) ?? []), made])
      return made
    }
    // A blended draw without a texture is an enchant glow the game fills at run time; it is left out
    const draws = part.groups.filter(group => group.texture != null || group.blend < 2 || special?.(group)).map(group => {
      // Each draw gets its own geometry view, so blended ones can be ordered after solid ones
      const view = new BufferGeometry()
      for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) view.setAttribute(name, geometry.getAttribute(name))
      view.setAttribute('uv1', second)
      view.setAttribute('wowUv2', second)
      view.setIndex(index)
      view.setDrawRange(group.start, group.count)
      view.boundingBox = null
      // Each draw wraps and scrolls its texture on its own
      const map = special?.(group) ?? copy(group.texture)
      if (map) {
        map.wrapS = group.wrap & 0x1 ? RepeatWrapping : ClampToEdgeWrapping
        map.wrapT = group.wrap & 0x2 ? RepeatWrapping : ClampToEdgeWrapping
        map.center.set(0.5, 0.5)
        map.needsUpdate = true
      }
      const material = group.flags & 0x1 || group.blend >= 3 ? new MeshBasicMaterial({ map, color: map ? 0xffffff : 0x888888 }) : new MeshLambertMaterial({ map, color: map ? 0xffffff : 0x888888 })
      blending(material, group)
      // Several layers, or a first layer on other coordinates, need the game's combiner
      const layers = group.layers ?? []
      const extra = layers.slice(1).map(layer => {
        const made = copy(layer.texture)
        if (made) { made.wrapS = layer.wrap & 0x1 ? RepeatWrapping : ClampToEdgeWrapping; made.wrapT = layer.wrap & 0x2 ? RepeatWrapping : ClampToEdgeWrapping; made.center.set(0.5, 0.5); made.needsUpdate = true }
        return made
      })
      if (map && layers[0]?.coords === 'uv2') map.channel = 1
      const uniforms = layers.length > 1 || group.combiner > 1 || layers[0]?.coords === 'env' ? applyCombiner(material, group.combiner, layers, extra, this.blank) : null
      const mesh = skeleton ? new SkinnedMesh(view, material) : new Mesh(view, material)
      if (mesh instanceof SkinnedMesh && skeleton) mesh.bind(skeleton, new Matrix4())
      mesh.frustumCulled = false
      mesh.renderOrder = (group.blend >= 2 ? 1000 : 0) + group.order
      root.add(mesh)
      return { mesh, material, group, texture: map, extra, uniforms }
    })
    // Particles live in world space, so they trail behind a moving bone as the game draws them
    const emitters = part.emitters.map(emitter => {
      const made = new ParticleEmitter(emitter, bones[emitter.bone] ?? root, part.bones[emitter.bone]?.pivot ?? [0, 0, 0], emitter.texture ? texture(emitter.texture) : null)
      this.scene.add(made.points)
      return made
    })
    return { part, bones, draws, root, emitters }
  }

  /**
   * Long models such as staves and swords are laid flat across the view with the head on the right, as item sites show
   * them. A weapon's model lies along the way it is held with the grip at its origin: when the grip is near one end, the
   * far end (the blade or head) is the head; when it is near the middle, the end with more of the model is
   */
  private layFlat(facing: Group) {
    const box = new Box3().setFromObject(facing)
    if (box.isEmpty()) return
    const size = box.getSize(new Vector3())
    const axis = (['x', 'y', 'z'] as const).reduce((best, entry) => (size[entry] > size[best] ? entry : best), 'x' as 'x' | 'y' | 'z')
    const others = (['x', 'y', 'z'] as const).filter(entry => entry !== axis)
    if (size[axis] < Math.max(...others.map(entry => size[entry])) * 1.3) return
    // +1 when the head is at the positive end of the axis
    const high = Math.abs(box.max[axis]), low = Math.abs(box.min[axis])
    let head = high >= low ? 1 : -1
    if (Math.max(high, low) < Math.min(high, low) * 1.5) {
      const center = (box.max[axis] + box.min[axis]) / 2
      const point = new Vector3()
      let mass = 0
      facing.traverse(object => {
        if (!(object instanceof Mesh)) return
        const positions = object.geometry.getAttribute('position')
        const index = object.geometry.index
        const { start, count } = object.geometry.drawRange
        const end = Math.min(index ? index.count : positions.count, start + count)
        for (let k = start; k < end; k += 3) {
          point.fromBufferAttribute(positions, index ? index.getX(k) : k).applyMatrix4(object.matrixWorld)
          mass += (point[axis] > center ? 1 : -1) * Math.hypot(point[others[0]!], point[others[1]!])
        }
      })
      head = mass >= 0 ? 1 : -1
    }
    // Turn the head's end of the axis to +X, the right of the view
    const from = new Vector3(axis === 'x' ? head : 0, axis === 'y' ? head : 0, axis === 'z' ? head : 0)
    facing.quaternion.premultiply(new Quaternion().setFromUnitVectors(from, new Vector3(1, 0, 0)))
    facing.updateMatrixWorld(true)
  }

  /** Every animation shown is a game ID; a part without it stands still */
  setAnimation(id: number | null) {
    const changed = this.animationId !== id
    this.animationId = id
    this.time = 0
    if (changed && this.frameWeaponMotion) this.fit()
  }

  setTurning(on: boolean) { this.controls.autoRotate = on }

  /** Frames the model again from the front */
  fit() {
    // Frame the swing, not just its first pose: a long blade can sweep well beyond the standing bounds
    const duration = this.frameWeaponMotion && this.animationId !== 0
      ? this.built[0]?.part.animations.find(clip => clip.id === this.animationId)?.duration ?? 0 : 0
    const box = new Box3(), time = this.time, step = this.step
    this.step = 0
    const samples = duration > 0 ? 8 : 1
    for (let frame = 0; frame < samples; frame++) {
      this.time = duration > 0 ? duration * frame / samples : time
      this.pose()
      // Skinned bounds read the bone matrices, which are otherwise only refreshed when a frame is drawn
      this.scene.updateMatrixWorld(true)
      this.scene.traverse(object => { if (object instanceof SkinnedMesh) object.skeleton.update() })
      box.union(new Box3().setFromObject(this.scene, true))
    }
    this.time = time
    this.step = step
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3()), size = box.getSize(new Vector3())
    const radius = Math.max(size.length() / 2, 0.05)
    const vertical = (this.camera.fov * Math.PI) / 360
    const angle = this.ownsRenderer ? Math.min(vertical, Math.atan(Math.tan(vertical) * this.camera.aspect)) : vertical
    const distance = radius / Math.sin(angle) * 1.12
    this.camera.near = distance / 100
    this.camera.far = distance * 100
    this.camera.position.copy(center).add(new Vector3(0.35, 0.18, 1).normalize().multiplyScalar(distance))
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(center)
    this.controls.minDistance = radius * 0.4
    this.controls.maxDistance = distance * 4
    this.controls.update()
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const pixels = (height * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    for (const { emitters } of this.built) for (const emitter of emitters) emitter.setScale(pixels)
  }

  private tick() {
    const delta = Math.min(this.clock.getDelta(), 0.1) * 1000
    if (this.playing) { this.elapsed += delta; this.time += delta }
    this.step = this.playing ? delta / 1000 : 0
    this.pose()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** Sets every bone, opacity, colour, and texture scroll for the current moment */
  private pose() {
    const camera = new Vector3(), up = new Vector3(), parentQuat = new Quaternion(), basis = new Matrix4(), position = new Vector3()
    this.camera.getWorldPosition(camera)
    up.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    for (const { part, bones, draws, root, emitters } of this.built) {
      const animation = this.animationId == null ? -1 : part.animations.findIndex(entry => entry.id === this.animationId)
      const duration = part.animations[animation]?.duration || 1
      const time = this.time % duration
      const at = (track: Parameters<typeof sample>[0], stride: number) => sample(track, animation, time, this.elapsed, part.globalLoops, stride)
      part.bones.forEach((bone, i) => {
        const parent = part.bones[bone.parent]
        const move = at(bone.translation, 3) ?? [0, 0, 0]
        const turn = at(bone.rotation, 4) ?? [0, 0, 0, 1]
        const size = at(bone.scale, 3) ?? [1, 1, 1]
        const node = bones[i]!
        node.position.set(bone.pivot[0] - (parent?.pivot[0] ?? 0) + move[0]!, bone.pivot[1] - (parent?.pivot[1] ?? 0) + move[1]!, bone.pivot[2] - (parent?.pivot[2] ?? 0) + move[2]!)
        node.quaternion.set(turn[0]!, turn[1]!, turn[2]!, turn[3]!)
        node.scale.set(size[0]!, size[1]!, size[2]!)
      })
      root.updateWorldMatrix(true, true)
      // Glows and sprites face the camera: their local X points at it, with Z kept up on screen
      part.bones.forEach((bone, i) => {
        if (!bone.billboard) return
        const node = bones[i]!
        node.getWorldPosition(position)
        const x = camera.clone().sub(position).normalize()
        const z = up.clone().sub(x.clone().multiplyScalar(up.dot(x))).normalize()
        const y = z.clone().cross(x)
        const world = new Quaternion().setFromRotationMatrix(basis.makeBasis(x, y, z))
        node.parent?.getWorldQuaternion(parentQuat)
        node.quaternion.copy(parentQuat.invert().multiply(world))
        node.updateMatrixWorld(true)
      })
      // An item's effects run whatever it is doing, so an emitter without keys for this animation uses the first that has them
      const lasting = (track: Parameters<typeof sample>[0], stride: number) => {
        const value = at(track, stride)
        if (value || !track) return value
        const index = track.keys.findIndex(Boolean)
        return index < 0 ? null : sample(track, index, this.time % (part.animations[index]?.duration || 1), this.elapsed, part.globalLoops, stride)
      }
      for (const emitter of emitters) emitter.update(this.step, lasting, this.upright.matrixWorld, 1)
      for (const draw of draws) {
        const { group, material } = draw
        const weight = group.opacity == null ? 1 : at(part.opacities[group.opacity] ?? null, 1)?.[0] ?? 1
        const tint = group.color == null ? null : part.colors[group.color]
        const alpha = tint ? at(tint.alpha, 1)?.[0] ?? 1 : 1
        const rgb = tint ? at(tint.color, 3) : null
        const value = Math.max(0, Math.min(1, weight * alpha))
        draw.mesh.visible = value > 0.002
        if (group.blend >= 2) material.opacity = value
        if (rgb) (material.color as Color).setRGB(rgb[0]!, rgb[1]!, rgb[2]!)
        const scroll = group.uvAnimation == null ? null : part.uvAnimations[group.uvAnimation]
        if (scroll && draw.texture) {
          const move = at(scroll.translation, 3)
          const turn = at(scroll.rotation, 4)
          const size = at(scroll.scale, 3)
          if (move) draw.texture.offset.set(move[0]!, move[1]!)
          if (turn) draw.texture.rotation = 2 * Math.atan2(turn[2]!, turn[3]!)
          if (size) draw.texture.repeat.set(size[0]!, size[1]!)
        }
        // The extra layers scroll on their own and carry their own weights
        if (draw.uniforms) {
          const layers = group.layers ?? []
          const weight = (index: number | null) => index == null ? 1 : at(part.opacities[index] ?? null, 1)?.[0] ?? 1
          draw.uniforms.wowWeights.value.set(weight(layers[0]?.weight ?? null), weight(layers[1]?.weight ?? null), weight(layers[2]?.weight ?? null))
          draw.extra.forEach((layerTexture, i) => {
            if (!layerTexture) return
            const layerScroll = layers[i + 1]?.uvAnimation == null ? null : part.uvAnimations[layers[i + 1]!.uvAnimation!]
            if (layerScroll) {
              const move = at(layerScroll.translation, 3), turn = at(layerScroll.rotation, 4), size = at(layerScroll.scale, 3)
              if (move) layerTexture.offset.set(move[0]!, move[1]!)
              if (turn) layerTexture.rotation = 2 * Math.atan2(turn[2]!, turn[3]!)
              if (size) layerTexture.repeat.set(size[0]!, size[1]!)
            }
            layerTexture.updateMatrix()
            ;(i === 0 ? draw.uniforms!.wowT1 : draw.uniforms!.wowT2).value.copy(layerTexture.matrix)
          })
        }
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.controls.dispose()
    for (const { draws, emitters } of this.built) { for (const draw of draws) { draw.mesh.geometry.dispose(); draw.material.dispose(); draw.texture?.dispose(); draw.extra.forEach(layer => layer?.dispose()) } emitters.forEach(emitter => emitter.dispose()) }
    this.blank.dispose()
    for (const texture of [...this.textures.values(), ...this.ownTextures]) texture.dispose()
    if (this.ownsRenderer) this.renderer.dispose()
  }
}
