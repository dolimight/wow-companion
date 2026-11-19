import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema } from '../../../shared/domain'
import type { OptimizerRun } from '../../../shared/optimizer'
import { BestTalents } from './BestTalents'

const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250, talents: { loadout: 'TUlORQ==', specId: 250, source: 'addon', observedAt: '2026-11-19T10:00:00.000Z' } })
const done: OptimizerRun = {
  id: 'r', characterId: 'c1', activity: 'mythicPlus', stage: 'done', startedAt: '2026-11-19T10:00:00.000Z', finishedAt: '2026-11-19T10:02:00.000Z', stageStartedAt: '2026-11-19T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: false, threads: 2, provider: null, baseline: 100_000, mode: 'talents', pool: [], screen: {},
  combos: [{ key: 'talents-1', label: 'Used by 7 of 12 top players', picks: {}, why: 'Ana, Bo', by: 'app', talents: 'R09PRA==', players: 7 }, { key: 'talents-2', label: 'Used by 3 of 12 top players', picks: {}, why: null, by: 'app', talents: 'U0FNRQ==', players: 3 }],
  results: { 'talents-1': { mean: 100_900, error: 40, gain: 900 }, 'talents-2': { mean: 100_020, error: 40, gain: 20 } },
  wearNow: null, chase: null, summary: 'The build used by 7 top players adds 900 damage per second over yours', notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('best talents', () => {
  it('ranks the top builds on your gear with a copy button, marking a gain inside the noise', () => {
    const client = new QueryClient()
    client.setQueryData(['optimizer', 'c1', 'talents'], done)
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><BestTalents character={knight} activity="mythicPlus" scenario="dungeon-slice" load="light" /></QueryClientProvider>)
    expect(html).toContain('Used by 7 of 12 top players')
    expect(html).toContain('+900')
    expect(html).toContain('Within noise')
    expect(html).toContain('Copy the build used by 7 of 12 top players')
  })

  it('asks for your own build before comparing', () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><BestTalents character={{ ...knight, talents: null }} activity="mythicPlus" scenario="dungeon-slice" load="light" /></QueryClientProvider>)
    expect(html).toContain('build isn')
  })
})
