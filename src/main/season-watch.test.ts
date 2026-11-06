import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vite-plus/test'
import { characterSchema, type Character } from '../shared/domain'
import type { Alert } from '../shared/alerts'
import { createSeasonWatch } from './season-watch'
import type { DatabaseClient } from './database'

const fixture = (level: number, score: number) => characterSchema.parse({
  id: 'c1', region: 'us', realm: 'Area 52', name: 'Fixture', itemLevel: 280,
  ratings: { mythicPlus: { value: score, label: 'Mythic+ score', seasonId: 's2' } },
  seasonRuns: { addon: { source: 'In-game season bests', observedAt: '2026-11-04T12:00:00.000Z', dungeons: [{ dungeon: 'Fixture Halls', timed: { level } }] } },
})

it('records the timeline, announces a raised season best once, and never on the first pass', async () => {
  let roster: Character[] = [fixture(10, 2000)]
  const states = new Map<string, unknown>()
  const db = { call: async (method: string, ...args: unknown[]) => {
    if (method === 'listCharacters') return roster
    if (method === 'getFeatureState') return states.get(`${args[0]}:${args[1]}`) ?? null
    if (method === 'saveFeatureState') { states.set(`${args[0]}:${args[1]}`, args[2]); return args[2] }
    throw new Error(method)
  } } as unknown as DatabaseClient
  const delivered: Alert[] = []
  const seenFile = path.join(await mkdtemp(path.join(tmpdir(), 'season-watch-')), 'seen.json')
  const watch = createSeasonWatch({ db, seenFile, deliver: alert => delivered.push(alert), timelineChanged: () => {} })

  await watch.observe()
  expect(delivered).toEqual([])
  expect((states.get('c1:timeline') as { points: unknown[] }).points).toHaveLength(1)

  roster = [fixture(12, 2080)]
  await watch.observe()
  await watch.observe()
  expect(delivered.map(alert => alert.body)).toEqual(['Timed +12 Fixture Halls, up from +10'])
  expect((states.get('c1:timeline') as { points: unknown[] }).points).toHaveLength(2)
  expect(JSON.parse(await readFile(seenFile, 'utf8'))).toEqual(['best:c1:Fixture Halls:12'])
})
