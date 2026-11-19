import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema } from '../../../shared/domain'
import type { OptimizerRun } from '../../../shared/optimizer'
import { EnchantsCheck } from './EnchantsCheck'

const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250 })
const done: OptimizerRun = {
  id: 'r', characterId: 'c1', activity: 'mythicPlus', stage: 'done', startedAt: '2026-11-19T10:00:00.000Z', finishedAt: '2026-11-19T10:02:00.000Z', stageStartedAt: '2026-11-19T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: false, threads: 2, provider: null, baseline: 100_000, mode: 'enchants', pool: [], screen: {},
  combos: [
    { key: 'enchant-back-1', label: 'Chant of Leeching Fangs', picks: {}, why: 'Used by 9 of 12 top players', by: 'app', enhancement: { kind: 'enchant', slot: 'back', name: 'Chant of Leeching Fangs', current: 'Chant of Burrowing Rapidity' } },
    { key: 'gems-1', label: 'Deadly Sapphire', picks: {}, why: 'In all 2 of your sockets', by: 'app', enhancement: { kind: 'gem', slot: null, name: 'Deadly Sapphire', current: null } },
  ],
  results: { 'enchant-back-1': { mean: 100_400, error: 40, gain: 400 }, 'gems-1': { mean: 100_030, error: 40, gain: 30 } },
  wearNow: null, chase: null, summary: 'Use Chant of Leeching Fangs on your cloak: 400 damage per second', notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('enchants and gems check', () => {
  it('lists each slot\'s best enchant swap and the best gem, marking gains inside the noise', () => {
    const client = new QueryClient()
    client.setQueryData(['optimizer', 'c1', 'enchants'], done)
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><EnchantsCheck character={knight} activity="mythicPlus" scenario="dungeon-slice" load="light" /></QueryClientProvider>)
    expect(html).toContain('Chant of Leeching Fangs')
    expect(html).toContain('Cloak · instead of Chant of Burrowing Rapidity')
    expect(html).toContain('+400')
    expect(html).toContain('Every socket')
    expect(html).toContain('Within noise')
  })
})
