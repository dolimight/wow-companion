import { describe, expect, it, vi } from 'vite-plus/test'
import { addCloseGuard, handleCloseRequest } from './close-guard'

describe('closing the window with unsaved work', () => {
  it('closes straight away when no editor is waiting', () => {
    const close = vi.fn()
    handleCloseRequest(close)
    expect(close).toHaveBeenCalledOnce()
  })
  it('asks the newest editor instead of closing, and closes again once it lets go', () => {
    const close = vi.fn(), plan = vi.fn(), outfit = vi.fn()
    const removePlan = addCloseGuard({ current: plan })
    const removeOutfit = addCloseGuard({ current: outfit })
    handleCloseRequest(close)
    expect([outfit.mock.calls.length, plan.mock.calls.length, close.mock.calls.length]).toEqual([1, 0, 0])
    removeOutfit()
    handleCloseRequest(close)
    expect(plan).toHaveBeenCalledOnce()
    removePlan()
    handleCloseRequest(close)
    expect(close).toHaveBeenCalledOnce()
  })
})
