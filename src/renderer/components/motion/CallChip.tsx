// Adapted from React Bits CallChip (https://reactbits.dev), MIT + Commons Clause, Copyright (c) 2026 David Haz · see NOTICE.md
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, RotateCw } from 'lucide-react'
import './call-chip.css'

export type CallChipStatus = 'idle' | 'running' | 'done' | 'error'

export type CallChipProps = {
  icon: ReactNode
  name: string
  argument?: string
  status: CallChipStatus
  /** How long the work usually takes; the fill sweeps toward 90% over this time and finishes when it's done */
  expectedMs?: number
  /** When the work began, so a chip that mounts late still shows the real elapsed time and fill */
  startedAt?: number | null
  onRetry?: () => void
  className?: string
}

type Glyph = 'tool' | 'check' | 'retry'
const HOLD_AT = 0.9
const SHAKE = [0, -1, 1, -0.66, 0.66, -0.33, 0]
const WORDS: Record<CallChipStatus, string> = { running: 'running', done: 'done', error: 'failed', idle: 'waiting' }
const format = (ms: number) => ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const reduceMotion = () => document.documentElement.dataset.reducedMotion === 'true' || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
const glyphOf = (status: CallChipStatus): Glyph => status === 'done' ? 'check' : status === 'error' ? 'retry' : 'tool'

/** A work-in-progress chip: its fill sweeps across while a timer ticks, then settles green or shakes red */
export function CallChip({ icon, name, argument, status, expectedMs = 2500, startedAt = null, onRetry, className = '' }: CallChipProps) {
  const root = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const timer = useRef<HTMLSpanElement>(null)
  const mountedRef = useRef(false)
  const elapsed = useRef(0)
  const shake = useRef<Animation | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const [mounted, setMounted] = useState(false)
  const [announce, setAnnounce] = useState('')
  const roll = useRef<{ current: Glyph; previous: Glyph | null }>({ current: glyphOf(status), previous: null })
  if (glyphOf(status) !== roll.current.current) roll.current = { current: glyphOf(status), previous: roll.current.current }

  const setFraction = (value: number, instant: boolean, duration?: number) => {
    const element = fill.current
    if (!element) return
    element.style.transition = instant ? 'none' : duration != null ? `transform ${Math.max(0, duration)}ms linear` : ''
    element.style.transform = `scaleX(${value})`
    if (instant) { void element.getBoundingClientRect(); element.style.transition = '' }
  }
  const apply = (next: CallChipStatus, animate: boolean) => {
    if (next === 'running') {
      shake.current?.cancel()
      // Picks up where the real work is, then sweeps the rest of the way toward the hold point
      const spent = startedAt ? Math.max(0, Date.now() - startedAt) : 0
      const start = Math.min(HOLD_AT, (spent / expectedMs) * HOLD_AT)
      setFraction(start, true)
      if (animate && !reduceMotion()) requestAnimationFrame(() => setFraction(HOLD_AT, false, Math.max(0, expectedMs - spent)))
    } else if (next === 'done') setFraction(1, !animate)
    else if (next === 'error') {
      const element = fill.current
      const live = element ? new DOMMatrix(getComputedStyle(element).transform).a : 0
      setFraction(Math.min(1, Math.max(0, live)), true)
      if (animate && !reduceMotion() && root.current) shake.current = root.current.animate(SHAKE.map(step => ({ transform: `translateX(${step * 6}px)`, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' })), { duration: 450, composite: 'add' })
    } else setFraction(0, true)
  }

  useEffect(() => {
    mountedRef.current = true
    setMounted(true)
    apply(statusRef.current, statusRef.current === 'running')
    return () => { mountedRef.current = false; shake.current?.cancel() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (mountedRef.current) apply(status, true) }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const write = (ms: number) => { elapsed.current = ms; if (timer.current) timer.current.textContent = format(ms) }
    if (status !== 'running') { if (status === 'idle' && timer.current) timer.current.textContent = '—'; return undefined }
    const began = startedAt ?? Date.now()
    write(Date.now() - began)
    const id = setInterval(() => write(Date.now() - began), 100)
    return () => { clearInterval(id); write(Date.now() - began) }
  }, [status, startedAt])
  useEffect(() => {
    const seconds = elapsed.current ? Math.round(elapsed.current / 1000) : 0
    setAnnounce(`${name}${argument ? ` ${argument}` : ''}, ${WORDS[status]}${status === 'done' && seconds ? ` in ${seconds} seconds` : ''}`)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const glyph = (value: Glyph) => value === roll.current.current ? 'in' : value === roll.current.previous ? 'out' : undefined
  return (
    <span ref={root} role="status" aria-busy={status === 'running' || undefined} data-status={status} data-mounted={mounted ? '' : undefined}
      className={`call-chip${className ? ` ${className}` : ''}`} style={{ '--cc-expected': `${expectedMs}ms` } as CSSProperties}>
      <span ref={fill} className="call-chip__fill" aria-hidden="true" />
      <span className="call-chip__slot" aria-hidden="true">
        <span className="call-chip__glyph" data-state={glyph('tool')}>{icon}</span>
        <span className="call-chip__glyph" data-state={glyph('check')}><Check size={14} strokeWidth={2.4} /></span>
        <span className="call-chip__glyph" data-state={glyph('retry')}><RotateCw size={13} strokeWidth={2.2} /></span>
      </span>
      <span className="call-chip__name" aria-hidden="true">{name}</span>
      {argument && <span className="call-chip__arg" aria-hidden="true">{argument}</span>}
      <span ref={timer} className="call-chip__timer" aria-hidden="true">0.0 s</span>
      {status === 'error' && onRetry && <button type="button" className="call-chip__retry" aria-label={`Retry ${name}`} onClick={onRetry} />}
      <span className="call-chip__sr">{announce}</span>
    </span>
  )
}
