import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildBundle } from './dungeon-data'

describe('dungeon data bundle', () => {
  it('collects each dungeon, keeps going when one source fails, and finds enemies through the best drawn route', async () => {
    const asked: Array<[string, string | null]> = []
    const bundle = await buildBundle({
      list: async () => ({ season: { slug: 's2', name: 'Season 2', endsAt: null }, dungeons: [{ slug: 'a', name: 'A', shortName: 'A', challengeModeId: 1, timerMs: 1000, artUrl: 'https://cdn.raiderio.net/a.jpg' }, { slug: 'b', name: 'B', shortName: 'B', challengeModeId: 2, timerMs: 2000, artUrl: null }], observedAt: 'x', source: 'test' }),
      routes: async (_season, dungeon) => {
        if (dungeon === 'b') throw new Error('down')
        return { season: 's2', dungeon, totalRuns: 10, timersMs: null, enemyForces: 300, encounterIds: [1], observedAt: 'x', source: 'test', families: [{ familyId: 'f1', runs: 9, timed: 9, medianClearMs: null, fastestClearMs: null, highestKey: null, latestAt: null, routeKey: null }, { familyId: 'f2', runs: 5, timed: 4, medianClearMs: null, fastestClearMs: null, highestKey: null, latestAt: null, routeKey: 'KEY' }] }
      },
      enemies: async (dungeon, routeKey) => { asked.push([dungeon, routeKey]); return { dungeon, forcesRequired: 300, enemies: [], observedAt: 'x', source: 'test' } },
      art: async (slug, url) => url ? `dungeons/${slug}.jpg` : null,
    }, new Date('2026-11-16T00:00:00Z'))
    assert.equal(bundle.generatedAt, '2026-11-16T00:00:00.000Z')
    assert.deepEqual(asked, [['a', 'KEY'], ['b', null]])
    assert.equal(bundle.dungeons[0]?.art, 'dungeons/a.jpg')
    assert.equal(bundle.dungeons[1]?.routes, null)
    assert.equal(bundle.dungeons[1]?.art, null)
  })
})
