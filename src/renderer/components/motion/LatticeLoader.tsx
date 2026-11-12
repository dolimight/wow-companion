// Adapted from React Bits LatticeLoader (https://reactbits.dev), MIT + Commons Clause, Copyright (c) 2026 David Haz · see NOTICE.md
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './lattice-loader.css'

export type LatticeStatus = 'working' | 'done' | 'error'
type Pattern = { cells: Array<number | null>; loop: number; scale: number; lit?: number }

const PATTERNS = {
  orbit: { cells: [0, 1, 2, 7, null, 3, 6, 5, 4], loop: 8, scale: 1.2 },
  ripple: { cells: [2, 1, 2, 1, 0, 1, 2, 1, 2], loop: 4.8, scale: 1.5 },
  snake: { cells: [0, 1, 2, 5, 4, 3, 6, 7, 8], loop: 9, scale: 1, lit: 0.35 },
  spiral: { cells: [0, 1, 2, 7, 8, 3, 6, 5, 4], loop: 9, scale: 1.2, lit: 0.35 },
} satisfies Record<string, Pattern>
const MARKS = { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] }
const STEP = 90
const format = (tenths: number) => tenths < 600 ? `${(tenths / 10).toFixed(1)}s` : `${Math.floor(tenths / 600)}m ${Math.floor((tenths % 600) / 10)}s`

/**
 * A status line for longer waits: a 3×3 grid of cells brightening in a wave beside a stopwatch, which settles into
 * a check or a cross when the work finishes. `startedAt` keeps the stopwatch true to when the work really began
 */
export function LatticeLoader({ label, doneLabel = 'Done in', errorLabel = 'Failed after', status = 'working', pattern = 'orbit', startedAt = null, showTimer = true, className = '' }: {
  label: string; doneLabel?: string; errorLabel?: string; status?: LatticeStatus; pattern?: keyof typeof PATTERNS; startedAt?: number | null; showTimer?: boolean; className?: string
}) {
  const shape: Pattern = PATTERNS[pattern]
  const delay = STEP * shape.scale
  const timer = useRef<HTMLSpanElement>(null)
  const tenths = useRef(0)
  const lastMark = useRef<'done' | 'error'>('done')
  const mark = status === 'working' ? lastMark.current : status
  lastMark.current = mark
  const [announce, setAnnounce] = useState(`${label}, in progress`)

  useLayoutEffect(() => {
    if (status !== 'working') return undefined
    const began = startedAt ?? Date.now()
    const paint = () => { tenths.current = Math.max(0, Math.floor((Date.now() - began) / 100)); if (timer.current) timer.current.textContent = format(tenths.current) }
    paint()
    const id = setInterval(paint, 100)
    return () => clearInterval(id)
  }, [status, startedAt])
  useEffect(() => {
    setAnnounce(status === 'working' ? `${label}, in progress` : `${status === 'done' ? doneLabel : errorLabel}${showTimer ? ` ${(tenths.current / 10).toFixed(1)} seconds` : ''}`)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span role="status" className={`lattice-loader${className ? ` ${className}` : ''}`} data-status={status} data-shape="round"
      style={{ '--ll-mark': status === 'error' ? '#e5534b' : 'var(--green)', '--ll-cycle': `${Math.round(shape.loop * delay)}ms` } as CSSProperties}>
      <span className="lattice-loader__grid" aria-hidden="true">
        <span className="lattice-loader__layer lattice-loader__run">
          {shape.cells.map((unit, index) => <span key={index} className="lattice-loader__cell" data-hole={unit == null ? '' : undefined}
            data-lit={shape.lit ? Math.round(shape.lit * 100) : undefined} style={unit == null ? undefined : { animationDelay: `${Math.round(unit * delay)}ms` }} />)}
        </span>
        <span className="lattice-loader__layer lattice-loader__mark">
          {shape.cells.map((_, index) => <span key={index} className="lattice-loader__cell" data-on={MARKS[mark].includes(index) ? '' : undefined} />)}
        </span>
      </span>
      <span className="lattice-loader__label" aria-hidden="true">
        <span className="lattice-loader__text" data-active={status === 'working' ? '' : undefined}>{label}</span>
        <span className="lattice-loader__text" data-active={status === 'done' ? '' : undefined}>{doneLabel}</span>
        <span className="lattice-loader__text" data-active={status === 'error' ? '' : undefined}>{errorLabel}</span>
      </span>
      {showTimer && <span ref={timer} className="lattice-loader__timer" aria-hidden="true">0.0s</span>}
      <span className="lattice-loader__sr">{announce}</span>
    </span>
  )
}
