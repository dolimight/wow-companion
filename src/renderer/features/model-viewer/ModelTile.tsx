import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ItemIcon } from '../items/ItemIcon'
import type { TileStage, TileState } from './tile-stage'
import type { TileTarget } from './tile-models'

export type Tile = { key: string; name: string; quality: number; icon: number | null; detail: string; target: TileTarget; open: () => void }

/** The grid's shared stage, which draws every visible tile's model */
export const TileStageContext = createContext<TileStage | null>(null)

/**
 * One model in the grid. While it is on screen its model plays in place, drawn by the grid's shared stage, and turns
 * while hovered; a model that can't be read shows its icon
 */
export function ModelTile({ tile }: { tile: Tile }) {
  const stage = useContext(TileStageContext)
  const frame = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<TileState>('loading')
  const handle = useRef<ReturnType<TileStage['add']> | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element || !stage) return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting)
      if (visible && !handle.current) handle.current = stage.add(element, tile.target, setState)
      if (!visible && handle.current) { handle.current.remove(); handle.current = null; setState(current => current === 'empty' ? current : 'loading') }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => { observer.disconnect(); handle.current?.remove(); handle.current = null }
  }, [stage, tile.target])

  const hover = (on: boolean) => handle.current?.hover(on)
  return (
    <li className="model-tile">
      <button ref={frame} type="button" className="model-tile-frame" data-state={state} onClick={tile.open} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onFocus={() => hover(true)} onBlur={() => hover(false)} aria-label={`Open ${tile.name} in 3D`}>
        {state === 'empty' ? <span className="model-tile-fallback"><ItemIcon icon={tile.icon} quality={tile.quality} size="large" /></span>
          : state === 'loading' ? <span className="model-tile-loading" aria-hidden="true" /> : null}
      </button>
      <span className={`model-tile-name quality-text-${tile.quality}`}>{tile.name}</span>
      <small className="model-tile-detail">{tile.detail}</small>
    </li>
  )
}
