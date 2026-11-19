import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema, gearItemSchema } from '../../../shared/domain'
import type { OptimizerRun } from '../../../shared/optimizer'
import { UpgradeAdvisor } from './UpgradeAdvisor'

const helm = gearItemSchema.parse({ slot: 'head', itemId: 1, name: 'Tier Helm', itemLevel: 308 })
const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250, progressionResources: { observedAt: '2026-11-19T10:00:00.000Z', currencies: { 3445: 30 } } })
const done: OptimizerRun = {
  id: 'r', characterId: 'c1', activity: 'mythicPlus', stage: 'done', startedAt: '2026-11-19T10:00:00.000Z', finishedAt: '2026-11-19T10:02:00.000Z', stageStartedAt: '2026-11-19T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: false, threads: 2, provider: null, baseline: 100_000, mode: 'upgrades',
  pool: [{ key: 'u', slot: 'head', item: helm, origin: 'upgrade', source: 'Hero 305 → 308', icon: 1, quality: 4, popularity: null, upgrade: { track: 'Hero', fromLevel: 305, toLevel: 308, crestId: '3445', crests: 20, gold: 40 } }],
  screen: { u: { mean: 100_700, error: 40, gain: 700 } }, combos: [], results: {}, wearNow: null, chase: null, summary: 'Upgrade Tier Helm first', notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('upgrade advisor', () => {
  it('ranks each upgrade with its crest cost, damage per crest, and whether the crests held cover it', () => {
    const client = new QueryClient()
    client.setQueryData(['optimizer', 'c1', 'upgrades'], done)
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><UpgradeAdvisor character={knight} activity="mythicPlus" /></QueryClientProvider>)
    expect(html).toContain('What to upgrade first')
    expect(html).toContain('Hero 305 → 308')
    expect(html).toContain('+700')
    expect(html).toContain('35 per crest')
    expect(html).toContain('Affordable now')
  })
})
