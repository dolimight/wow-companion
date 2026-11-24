import { useEffect, useRef, useState, type RefObject } from 'react'
import { ModelTile, TileStageContext, type Tile } from './ModelTile'
import { TileStage } from './tile-stage'
import './model-viewer.css'

/** One stage renders the visible tiles in either the workspace or a dialog's scroll area */
export function TileGrid({ tiles, more, onMore, paused = false, host }: {
  tiles: Tile[]
  more: boolean
  onMore: () => void
  paused?: boolean
  host?: RefObject<HTMLDivElement | null>
}) {
  const end = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLUListElement>(null)
  const [stage, setStage] = useState<TileStage | null>(null)
  useEffect(() => {
    const element = host?.current ?? undefined
    try {
      const made = new TileStage(() => {
        const rect = (element ?? grid.current?.closest('.workspace-scroll') ?? document.documentElement).getBoundingClientRect()
        return { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(window.innerWidth, rect.right), bottom: Math.min(window.innerHeight, rect.bottom) }
      }, element)
      setStage(made)
      return () => made.dispose()
    } catch {
      // Item icons remain selectable if WebGL is unavailable
      setStage(null)
    }
  }, [host])
  useEffect(() => { if (stage) stage.paused = paused }, [stage, paused])
  const latest = useRef(onMore)
  latest.current = onMore
  useEffect(() => {
    const element = end.current
    if (!element || !more) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) latest.current()
    }, { rootMargin: host ? '200px' : '600px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [more, tiles.length, host])
  return <TileStageContext.Provider value={stage}>
    <ul ref={grid} className="model-grid">
      {tiles.map(tile => <ModelTile key={tile.key} tile={tile} />)}
    </ul>
    {more && <div ref={end} className="model-grid-end muted small" role="status">Loading more…</div>}
  </TileStageContext.Provider>
}
