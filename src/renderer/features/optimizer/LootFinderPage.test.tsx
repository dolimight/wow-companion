import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema, gearItemSchema } from '../../../shared/domain'
import type { OptimizerCandidate, OptimizerRun } from '../../../shared/optimizer'
import { LootResults } from './LootFinderPage'

const mage = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Alwin', className: 'Mage', specName: 'Arcane', specId: 62, gear: [gearItemSchema.parse({ slot: 'back', itemId: 1, name: 'Old Cloak', itemLevel: 290 })] })
const drop = (key: string, itemId: number, name: string, instance: string): OptimizerCandidate => ({ key, slot: 'back', item: gearItemSchema.parse({ slot: 'back', itemId, name, itemLevel: 305 }), origin: 'drop', source: instance, icon: 9, quality: 4, popularity: null, instance, boss: null })
const run: OptimizerRun = {
  id: 'r1', characterId: 'c1', activity: 'mythicPlus', stage: 'done', startedAt: '2026-11-19T10:00:00.000Z', finishedAt: '2026-11-19T10:04:00.000Z', stageStartedAt: '2026-11-19T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: true, threads: 2, provider: null, baseline: 100_000, mode: 'loot', track: 'hero', trackLevel: 305, reused: 1,
  pool: [drop('a', 5, 'Vale Drape', "Kings' Rest"), drop('b', 6, 'Grotto Cape', 'Priory')],
  screen: { a: { mean: 101_200, error: 40, gain: 1200 }, b: { mean: 100_010, error: 40, gain: 10 } },
  combos: [], results: {}, wearNow: null, chase: null, summary: "Kings' Rest has the most for you", notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('loot finder results', () => {
  it('ranks sources by clear gains and leaves out ones inside the noise', () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><LootResults run={run} character={mage} /></QueryClientProvider>)
    expect(html).toContain('Kings&#x27; Rest')
    expect(html).toContain('+1,200')
    expect(html).toContain('Hero track · item level 305')
    expect(html).toContain('1 reused from earlier runs')
    expect(html).not.toContain('Priory')
  })
})
