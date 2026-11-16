import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { fetchDungeonRoutes, fetchSeasonDungeons } from './raiderio-dungeons'

const season = (slug: string, starts: string, dungeons = [{ slug: 'den-of-nalorakk', name: 'Den of Nalorakk', short_name: 'DEN', challenge_mode_id: 586, keystone_timer_seconds: 1920 }]) => ({ slug, name: slug, is_main_season: true, starts: { us: starts }, dungeons })

afterEach(() => { vi.unstubAllGlobals() })

describe('Raider.IO dungeons', () => {
  it('picks the newest started season across expansions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      const expansion = url.searchParams.get('expansion_id')
      const body = expansion === '11' ? { seasons: [season('season-mn-1', '2026-03-01T00:00:00Z'), season('season-mn-2', '2026-09-01T00:00:00Z')] } : expansion === '12' ? { seasons: [season('season-next', '2099-01-01T00:00:00Z')] } : {}
      return new Response(JSON.stringify(body), { status: 200 })
    }))
    const list = await fetchSeasonDungeons()
    expect(list.season.slug).toBe('season-mn-2')
    expect(list.dungeons).toEqual([{ slug: 'den-of-nalorakk', name: 'Den of Nalorakk', shortName: 'DEN', challengeModeId: 586, timerMs: 1_920_000, artUrl: null }])
  })

  it('reads route families, timers, forces, and journal encounters', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      if (url.pathname === '/api/mythic-plus/routes/popular') return new Response(JSON.stringify({ totalEligibleRuns: 520544, families: [{ familyId: 'rf2:a', anonymousRunCount: 9521, timedRunCount: 8930, medianClearTimeMs: 1642649, highestKeyLevel: 22, representative: { routeKey: null } }, { familyId: 'rf2:b', anonymousRunCount: 5370, timedRunCount: 4982, representative: { routeKey: 'G6mLASJ' } }] }))
      if (url.pathname === '/api/mythic-plus/routes/dungeon-resource') return new Response(JSON.stringify({ timersMs: { plusOne: 1920000, plusTwo: 1536000, plusThree: 1152000 }, enemyForces: 729, bosses: [{ iconUrl: '/images/wow/encounter-journal/2776.png' }, { iconUrl: '/images/wow/encounter-journal/2777.png' }] }))
      throw new Error(`Unexpected ${url.pathname}`)
    }))
    const routes = await fetchDungeonRoutes('season-mn-2', 'den-of-nalorakk')
    expect(routes).toMatchObject({ totalRuns: 520544, enemyForces: 729, encounterIds: [2776, 2777], timersMs: { plusTwo: 1536000 } })
    expect(routes.families.map(family => [family.runs, family.timed, family.routeKey])).toEqual([[9521, 8930, null], [5370, 4982, 'G6mLASJ']])
  })

  it('says routes are unavailable when the undocumented shape changes, and still works without the extras', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith('popular') ? { families: [{ unexpected: true }] } : {}), { status: 200 })))
    await expect(fetchDungeonRoutes('s', 'd')).rejects.toThrow('Raider.IO changed its routes data')
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.pathname.endsWith('popular') ? new Response(JSON.stringify({ families: [] })) : new Response('nope', { status: 500 })))
    expect(await fetchDungeonRoutes('s', 'd')).toMatchObject({ families: [], timersMs: null, enemyForces: null, encounterIds: [] })
  })

  it('refuses a route key that is not a plain key, so it never reaches the embed address', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith('popular') ? { families: [{ familyId: 'x', anonymousRunCount: 1, timedRunCount: 1, representative: { routeKey: '../evil' } }] } : {}))))
    await expect(fetchDungeonRoutes('s', 'd')).rejects.toThrow()
  })
})
