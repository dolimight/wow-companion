import { afterEach, describe, expect, it } from 'vite-plus/test'
import { gearMemory } from './plan-item'
import { collectUpdateBlockers, setLocalUpdateBlocker } from './update-safety'

afterEach(() => {
  gearMemory.clear()
  setLocalUpdateBlocker('outfit', null)
  setLocalUpdateBlocker('profile', null)
})

describe('renderer restart safety', () => {
  it('retains blockers for unsaved plans outside the mounted editor until saved', () => {
    gearMemory.set('alt:raiding:64', { items: [], name: 'Alt plan', dirty: true })
    expect(collectUpdateBlockers()).toContain('Save your gear plans before restarting')
    gearMemory.get('alt:raiding:64')!.dirty = false
    expect(collectUpdateBlockers()).toEqual([])
  })
  it('clearing one editor cannot clear another editor’s same-reason blocker', () => {
    setLocalUpdateBlocker('outfit', 'Save changes')
    setLocalUpdateBlocker('profile', 'Save changes')
    expect(collectUpdateBlockers()).toEqual(['Save changes'])
    setLocalUpdateBlocker('outfit', null)
    expect(collectUpdateBlockers()).toEqual(['Save changes'])
    setLocalUpdateBlocker('profile', null)
    expect(collectUpdateBlockers()).toEqual([])
  })
})
