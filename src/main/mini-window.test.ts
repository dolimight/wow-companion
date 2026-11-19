import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('electron', () => ({ BrowserWindow: class {}, globalShortcut: { register: vi.fn(), unregister: vi.fn() }, screen: {} }))
const { miniRoute } = await import('./mini-window')

describe('play window route', () => {
  it('opens only a play mode page for a dungeon or raid', () => {
    expect(miniRoute.test('#/mini/c7268413-91f5/dungeons?dungeon=kings-rest&play=1')).toBe(true)
    expect(miniRoute.test('#/mini/c1/raids?raid=the-venomous-abyss&play=1')).toBe(true)
    expect(miniRoute.test('#/characters/c1/settings')).toBe(false)
    expect(miniRoute.test('https://example.com/#/mini/c1/dungeons?dungeon=x')).toBe(false)
    expect(miniRoute.test('#/mini/c1/dungeons?dungeon=<script>')).toBe(false)
  })
})
