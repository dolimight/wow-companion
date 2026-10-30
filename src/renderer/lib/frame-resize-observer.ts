/** Deliver layout-changing observers on animation frames, outside native observer delivery */
export function installFrameResizeObserver(scope: Window & typeof globalThis = window) {
  const NativeObserver = scope.ResizeObserver
  class FrameResizeObserver implements ResizeObserver {
    private pending = new Map<Element, ResizeObserverEntry>()
    private frame = 0
    private observer: ResizeObserver
    constructor(callback: ResizeObserverCallback) {
      this.observer = new NativeObserver((entries) => {
        for (const entry of entries) this.pending.set(entry.target, entry)
        if (!this.frame) this.frame = scope.requestAnimationFrame(() => {
          this.frame = 0
          const latest = [...this.pending.values()]
          this.pending.clear()
          if (latest.length) callback(latest, this)
        })
      })
    }
    observe(target: Element, options?: ResizeObserverOptions) { this.observer.observe(target, options) }
    unobserve(target: Element) { this.pending.delete(target); this.observer.unobserve(target) }
    disconnect() {
      this.observer.disconnect()
      if (this.frame) scope.cancelAnimationFrame(this.frame)
      this.frame = 0
      this.pending.clear()
    }
  }
  scope.ResizeObserver = FrameResizeObserver
}
