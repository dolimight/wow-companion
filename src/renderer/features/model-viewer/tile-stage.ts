import { SRGBColorSpace, WebGLRenderer } from 'three'
import { iconUrl } from '../../lib/assets'
import { ItemModelScene, type ViewSubject } from './scene'
import { loadSubject, tileKey, type TileTarget } from './tile-models'

export type TileState = 'loading' | 'ready' | 'empty'
type Entry = { element: HTMLElement; target: TileTarget; background: string; scene: ItemModelScene | null; onState: (state: TileState) => void; hovered: boolean }

/** Models read recently, so a tile scrolled away and back appears at once */
const subjects = new Map<string, Promise<ViewSubject | null>>()
function subject(target: TileTarget) {
  const key = tileKey(target)
  let found = subjects.get(key)
  if (!found) {
    found = loadSubject(target).catch(() => null)
    subjects.set(key, found)
    if (subjects.size > 80) subjects.delete(subjects.keys().next().value!)
  }
  return found
}

/** Models read from the game files at the same time; more only queue in the worker */
const parallel = 2

/**
 * Draws every visible tile's model, animating, through one canvas laid over the page, each into its tile's place.
 * One WebGL context serves the whole grid, so any number of tiles can play at once. The canvas lets the pointer
 * through, so the tiles underneath stay clickable
 */
export class TileStage {
  private canvas = document.createElement('canvas')
  private renderer: WebGLRenderer
  private entries = new Set<Entry>()
  private queue: Entry[] = []
  private busy = 0
  private frame = 0
  private last = performance.now()
  private sizeObserver?: ResizeObserver
  paused = false

  constructor(private clip: () => { left: number; top: number; right: number; bottom: number }, private host?: HTMLElement) {
    this.canvas.className = 'model-grid-stage'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    if (host) this.canvas.classList.add('model-grid-stage-local')
    const parent = host ?? document.body
    parent.appendChild(this.canvas)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.resize()
    window.addEventListener('resize', this.resize)
    if (host) {
      this.sizeObserver = new ResizeObserver(this.resize)
      this.sizeObserver.observe(host)
    }
    const loop = (now: number) => { this.frame = requestAnimationFrame(loop); this.draw(now) }
    this.frame = requestAnimationFrame(loop)
  }

  private resize = () => this.renderer.setSize(this.host?.clientWidth ?? window.innerWidth, this.host?.clientHeight ?? window.innerHeight, false)

  /** Shows a tile's model once it is read; returns what to call when the tile leaves the view */
  add(element: HTMLElement, target: TileTarget, onState: (state: TileState) => void) {
    const entry: Entry = { element, target, background: getComputedStyle(element).backgroundColor || '#1c1c1e', scene: null, onState, hovered: false }
    this.entries.add(entry)
    this.queue.push(entry)
    this.pump()
    return {
      hover: (on: boolean) => { entry.hovered = on; entry.scene?.setTurning(on) },
      remove: () => { this.entries.delete(entry); entry.scene?.dispose(); entry.scene = null },
    }
  }

  private pump() {
    while (this.busy < parallel && this.queue.length) {
      const entry = this.queue.shift()!
      if (!this.entries.has(entry)) continue
      this.busy++
      void subject(entry.target).then(found => {
        if (!this.entries.has(entry)) return
        if (!found) return entry.onState('empty')
        entry.scene = new ItemModelScene(this.canvas, found, iconUrl, { renderer: this.renderer, background: entry.background })
        entry.scene.setTurning(entry.hovered)
        entry.onState('ready')
      }).catch(() => {
        if (this.entries.has(entry)) entry.onState('empty')
      }).finally(() => { this.busy--; this.pump() })
    }
  }

  private draw(now: number) {
    const delta = now - this.last
    this.last = now
    this.renderer.setScissorTest(false)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    if (this.paused) return
    this.renderer.setScissorTest(true)
    const clip = this.clip()
    const hostRect = this.host?.getBoundingClientRect()
    const x = hostRect?.left ?? 0, y = hostRect?.top ?? 0
    const height = this.host?.clientHeight ?? window.innerHeight
    const localClip = { left: clip.left - x, top: clip.top - y, right: clip.right - x, bottom: clip.bottom - y }
    for (const entry of this.entries) {
      if (!entry.scene) continue
      const rect = entry.element.getBoundingClientRect()
      if (rect.bottom < clip.top || rect.top > clip.bottom || rect.right < clip.left || rect.left > clip.right) continue
      entry.scene.advance(delta)
      entry.scene.renderViewport({ left: rect.left - x, top: rect.top - y, width: rect.width, height: rect.height }, localClip, height)
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    window.removeEventListener('resize', this.resize)
    this.sizeObserver?.disconnect()
    for (const entry of this.entries) entry.scene?.dispose()
    this.entries.clear()
    this.renderer.dispose()
    this.canvas.remove()
  }
}
