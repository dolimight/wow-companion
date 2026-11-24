import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ItemIcon } from '../items/ItemIcon'
import type { TileStage, TileState } from './tile-stage'
import { tileKey, type TileTarget } from './tile-models'

export type Tile = { key: string; name: string; quality: number; icon: number | null; detail: string; target: TileTarget; open: () => void; actionLabel?: string }

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
  const targetKey = tileKey(tile.target)
  const target = useRef(tile.target)
  target.current = tile.target

  useEffect(() => {
    const element = frame.current
    if (!element || !stage) return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting)
      if (visible && !handle.current) handle.current = stage.add(element, target.current, setState)
      if (!visible && handle.current) { handle.current.remove(); handle.current = null; setState(current => current === 'empty' ? current : 'loading') }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => { observer.disconnect(); handle.current?.remove(); handle.current = null }
  }, [stage, targetKey])

  const hover = (on: boolean) => handle.current?.hover(on)
  return (
    <li className="model-tile">
      <button ref={frame} type="button" className="model-tile-frame" data-state={stage ? state : 'empty'} onClick={tile.open} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onFocus={() => hover(true)} onBlur={() => hover(false)} aria-label={tile.actionLabel ?? `Open ${tile.name} in 3D`}>
        {state === 'empty' || !stage ? <span className="model-tile-fallback"><ItemIcon icon={tile.icon} quality={tile.quality} size="large" /></span>
          : state === 'loading' ? <span className="model-tile-loading" aria-hidden="true" /> : null}
      </button>
      <span className={`model-tile-name quality-text-${tile.quality}`}>{tile.name}</span>
      <small className="model-tile-detail">{tile.detail}</small>
    </li>
  )
}
