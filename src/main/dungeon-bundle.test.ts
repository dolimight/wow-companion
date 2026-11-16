import { describe, expect, it } from 'vite-plus/test'
import { bundledList, currentBundle } from './dungeon-bundle'
import type { DungeonBundle } from '../shared/dungeons'

const bundle = (slug: string, generatedAt: string, endsAt: string | null): DungeonBundle => ({ season: { slug, name: slug, endsAt }, generatedAt, dungeons: [{ slug: 'den-of-nalorakk', name: 'Den of Nalorakk', shortName: 'DEN', challengeModeId: 586, timerMs: 1_920_000, art: 'dungeons/den-of-nalorakk.jpg', artUrl: null, routes: null, enemies: null }] })

describe('bundled dungeon data', () => {
  it('uses the newest season that has not ended', () => {
    const old = bundle('s1', '2026-03-01T00:00:00Z', '2026-08-01T00:00:00Z'), current = bundle('s2', '2026-09-01T00:00:00Z', null)
    expect(currentBundle(Date.parse('2026-11-16T00:00:00Z'), [old, current])?.season.slug).toBe('s2')
    expect(currentBundle(Date.parse('2026-11-16T00:00:00Z'), [old])).toBeNull()
  })
  it('lists the dungeons without the bundled extras', () => {
    const list = bundledList(bundle('s2', '2026-09-01T00:00:00Z', null))
    expect(list.dungeons[0]).toEqual({ slug: 'den-of-nalorakk', name: 'Den of Nalorakk', shortName: 'DEN', challengeModeId: 586, timerMs: 1_920_000, art: 'dungeons/den-of-nalorakk.jpg', artUrl: null })
    expect(list.source).toBe('Bundled from Raider.IO')
  })
  it('ships the current season', () => {
    const shipped = currentBundle(Date.parse('2026-11-16T00:00:00Z'))
    expect(shipped?.dungeons.length).toBeGreaterThan(0)
    expect(shipped?.dungeons.every(dungeon => dungeon.timerMs > 0)).toBe(true)
  })
})
