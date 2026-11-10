import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { fetchTopPlayers, wornLevels } from './raiderio-top'
import { commonCopy } from '../../shared/top-players'

const player = (name: string) => ({ score: 3500, runs: [{ mythicLevel: 20 }], character: { name, path: `/characters/us/realm/${name}`, class: { name: 'Death Knight' }, spec: { id: 250, name: 'Blood' }, realm: { name: 'Realm', slug: 'realm' }, region: { slug: 'us' }, talentLoadoutText: null } })
const helm = (level: number, bonuses: number[]) => ({ gear: { item_level_equipped: level, items: { head: { item_id: 42, name: 'Crown', item_level: level, bonuses } } } })
const profiles: Record<string, unknown> = { A: helm(342, [2, 1]), B: helm(342, [1, 2]), C: helm(334, [1, 3]) }

function respond(url: URL) {
  if (url.pathname === '/api/v1/mythic-plus/static-data') return { seasons: [{ slug: 'season-test', name: 'Test Season', is_main_season: true, starts: { us: '2026-01-01T00:00:00Z' } }] }
  if (url.pathname === '/api/mythic-plus/rankings/specs') return { rankings: { rankedCharacters: ['A', 'B', 'C'].map(player) } }
  if (url.pathname === '/api/v1/characters/profile') return profiles[url.searchParams.get('name')!]
  throw new Error(`Unexpected request ${url.pathname}`)
}

afterEach(() => { vi.unstubAllGlobals() })

describe('top players gear', () => {
  it('keeps the most worn copy with its level and bonus IDs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(JSON.stringify(respond(url)), { status: 200 })))
    const result = await fetchTopPlayers({ specId: 250, specName: 'Blood', className: 'Death Knight', region: 'us' })
    const crown = result.slots.head?.items[0]
    // The most worn level, never an average between ranks that no copy of the item has
    expect(crown).toMatchObject({ id: 42, count: 3, level: 342, levelRange: { min: 334, max: 342 }, copy: { itemLevel: 342, bonusIds: [1, 2], count: 2 } })
  })
  it('reports a level players actually wear, the higher on a tie, with the spread', () => {
    // Six at 344 and five at 341 averaged to 342, a level the weapon never drops at
    expect(wornLevels(new Map([[344, 6], [341, 5]]))).toEqual({ level: 344, levelRange: { min: 341, max: 344 } })
    expect(wornLevels(new Map([[341, 3], [344, 3]])).level).toBe(344)
    expect(wornLevels(undefined)).toEqual({ level: null })
  })
  it('prefers the higher level when two copies are worn equally often', () => {
    expect(commonCopy([{ itemLevel: 334, bonusIds: [1], count: 2 }, { itemLevel: 342, bonusIds: [2], count: 2 }])?.itemLevel).toBe(342)
    expect(commonCopy([])).toBeNull()
  })
})
