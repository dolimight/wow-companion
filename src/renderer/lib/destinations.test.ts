import { describe, expect, it } from 'vite-plus/test'
import { defaultDestination, destinationPath, resolveCharacterPath, safeReturn, sameDestinationFor } from './destinations'

describe('character destinations', () => {
  it('resolves the seven canonical destinations', () => {
    expect(resolveCharacterPath('overview')).toEqual({ kind: 'ok', destination: { section: 'overview' } })
    expect(resolveCharacterPath('wardrobe')).toEqual({ kind: 'ok', destination: { section: 'wardrobe' } })
    expect(resolveCharacterPath('gear', 'owned')).toEqual({ kind: 'ok', destination: { section: 'gear', view: 'owned' } })
    expect(resolveCharacterPath('performance', 'history')).toEqual({ kind: 'ok', destination: { section: 'performance', view: 'history' } })
  })
  it('redirects every old link to its new home', () => {
    expect(resolveCharacterPath('progression')).toEqual({ kind: 'redirect', destination: { section: 'gear', view: 'progress' } })
    expect(resolveCharacterPath('gear')).toEqual({ kind: 'redirect', destination: { section: 'gear', view: 'plan' } })
    expect(resolveCharacterPath('inventory')).toEqual({ kind: 'redirect', destination: { section: 'gear', view: 'owned' } })
    expect(resolveCharacterPath('simulations')).toEqual({ kind: 'redirect', destination: { section: 'gear', view: 'simulations' } })
    expect(resolveCharacterPath('standings')).toEqual({ kind: 'redirect', destination: { section: 'performance', view: 'standing' } })
    expect(resolveCharacterPath('top')).toEqual({ kind: 'redirect', destination: { section: 'performance', view: 'leaders' } })
    expect(resolveCharacterPath('performance')).toEqual({ kind: 'redirect', destination: { section: 'performance', view: 'standing' } })
  })
  it('never redirects to itself, so aliases cannot loop', () => {
    for (const section of ["progression", "gear", "inventory", "simulations", "standings", "top", "performance"]) {
      const first = resolveCharacterPath(section)
      if (first.kind !== 'redirect') throw new Error('expected a redirect')
      const path = destinationPath('c', first.destination).split('/')
      expect(resolveCharacterPath(path[3], path[4]).kind).toBe('ok')
    }
  })
  it('reports unknown sections and views instead of showing Overview', () => {
    expect(resolveCharacterPath('nonsense').kind).toBe('unknown')
    expect(resolveCharacterPath('gear', 'nonsense').kind).toBe('unknown')
    expect(resolveCharacterPath('overview', 'extra').kind).toBe('unknown')
  })
  it('keeps the section and view when the character changes', () => {
    expect(sameDestinationFor('/characters/a/gear/plan')).toEqual({ section: 'gear', view: 'plan' })
    expect(sameDestinationFor('/characters/a/top')).toEqual({ section: 'performance', view: 'leaders' })
    expect(sameDestinationFor('/characters')).toBeNull()
  })
  it('opens parent destinations on their default view', () => {
    expect(destinationPath('c', defaultDestination('gear'))).toBe('/characters/c/gear/progress')
    expect(destinationPath('c', defaultDestination('performance'))).toBe('/characters/c/performance/standing')
    expect(destinationPath('c', defaultDestination('wardrobe'))).toBe('/characters/c/wardrobe')
  })
  it('accepts only internal return destinations', () => {
    expect(safeReturn('/tonight')).toBe('/tonight')
    expect(safeReturn('/week?expanded=abc-1')).toBe('/week?expanded=abc-1')
    expect(safeReturn('/characters/abc-1/gear/plan')).toBe('/characters/abc-1/gear/plan')
    expect(safeReturn('https://example.com')).toBeNull()
    expect(safeReturn('javascript:alert(1)')).toBeNull()
    expect(safeReturn('//evil.com')).toBeNull()
    expect(safeReturn(undefined)).toBeNull()
  })
})
