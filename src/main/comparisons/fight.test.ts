import { describe, expect, it } from 'vite-plus/test'
import { createLogsProvider, FIGHT_ACTORS_QUERY } from './providers'
import { MemorySecretStore } from '../secrets'
import { characterSchema } from '../../shared/domain'
import { tableAbilities, tableDeaths } from '../../shared/comparisons'
import { fightReview } from '../ai/features/fight-review'

const character = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250 })
const url = 'https://www.warcraftlogs.com/reports/AbCdEfGhIjKlMnOp'
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('Warcraft Logs tables', () => {
  it('reads ability totals from either table shape, biggest first', () => {
    expect(tableAbilities({ data: { entries: [{ name: 'Dol', total: 10, abilities: [{ name: 'Heart Strike', total: 300 }, { name: 'Death Strike', total: 500 }] }] } }).map(row => row.name)).toEqual(['Death Strike', 'Heart Strike'])
    expect(tableAbilities({ data: { entries: [{ name: 'Marrowrend', total: 20 }, { name: 'Bad', total: 'x' }] } })).toEqual([{ name: 'Marrowrend', total: 20 }])
    expect(tableAbilities(null)).toEqual([])
  })

  it('keeps only this player\'s deaths, timed from the fight start', () => {
    expect(tableDeaths({ data: { entries: [{ name: 'Dol', timestamp: 70_000, killingBlow: { name: 'Spit Gold' } }, { name: 'Other', timestamp: 80_000 }] } }, 'Dol', 10_000)).toEqual([{ atMs: 60_000, killingBlow: 'Spit Gold' }])
  })
})

describe('Warcraft Logs fight', () => {
  it('matches the character, reads one fight\'s tables, and sums them per second', async () => {
    const bodies: string[] = []
    const fetcher = (async (input: string | URL, init?: RequestInit) => {
      const target = String(input)
      if (target.endsWith('/oauth/token')) return json({ access_token: 'token', expires_in: 3600 })
      bodies.push(String(init?.body))
      if (String(init?.body).includes('CompanionFightActors')) return json({ data: { reportData: { report: { code: 'AbCdEfGhIjKlMnOp', visibility: 'public', masterData: { gameVersion: 1, actors: [{ id: 7, name: 'Dol', server: 'Gurubashi', type: 'Player', subType: 'DeathKnight' }] }, fights: [{ id: 3, encounterID: 1, name: 'The Golden Serpent', difficulty: 10, kill: true, keystoneLevel: 12, startTime: 10_000, endTime: 130_000, friendlyPlayers: [7] }] } } } })
      return json({ data: { reportData: { report: { done: { data: { entries: [{ name: 'Heart Strike', total: 6_000_000 }] } }, taken: { data: { entries: [{ name: 'Spit Gold', total: 900_000 }] } }, casts: { data: { entries: [{ name: 'Death Strike', total: 31 }] } }, deaths: { data: { entries: [] } } } }, rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 100 } } })
    }) as typeof fetch
    const secrets = new MemorySecretStore()
    await secrets.set('warcraftlogs-client', JSON.stringify({ clientId: 'fixture-client-id', clientSecret: 'fixture-client-secret-value' }))
    const provider = createLogsProvider({ secrets, fetcher, now: () => new Date('2026-11-19T12:00:00Z') })
    const fight = await provider.fetchFight({ character, url, fightId: 3 })
    expect(fight).toMatchObject({ fightId: 3, name: 'The Golden Serpent', kill: true, keystoneLevel: 12, durationMs: 120_000, damage: { total: 6_000_000, perSecond: 50_000 }, casts: [{ name: 'Death Strike', count: 31 }], deaths: [] })
    expect(bodies[0]).toContain(JSON.stringify(FIGHT_ACTORS_QUERY).slice(1, 40))
    expect(JSON.parse(bodies[1]!).variables).toEqual({ code: 'AbCdEfGhIjKlMnOp', fight: 3, actor: 7 })
    // The review prompt carries only these numbers
    const prompt = fightReview.prompt({ characterId: 'c1', fight }, { character })
    expect(prompt).toContain('The Golden Serpent +12, a kill, 2:00 long')
    expect(prompt).toContain('- Heart Strike: 6.0M (100%)')
    expect(prompt).toContain('Deaths: none')
  })
})
