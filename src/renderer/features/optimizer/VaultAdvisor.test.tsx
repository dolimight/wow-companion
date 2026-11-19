import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema, gearItemSchema } from '../../../shared/domain'
import type { OptimizerCandidate, OptimizerRun } from '../../../shared/optimizer'
import { VaultAdvisor } from './VaultAdvisor'

const cloak = gearItemSchema.parse({ slot: 'back', itemId: 4, name: 'Vault Cloak', itemLevel: 318 })
const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250, inventoryObservations: [{ location: 'vault', items: [cloak] }] })
const none = { ...knight, inventoryObservations: [] }
const choice: OptimizerCandidate = { key: 'v', slot: 'back', item: cloak, origin: 'vault', source: 'Claim it from the Great Vault', icon: 1, quality: 4, popularity: null }
const done: OptimizerRun = {
  id: 'r', characterId: 'c1', activity: 'mythicPlus', stage: 'done', startedAt: '2026-11-19T10:00:00.000Z', finishedAt: '2026-11-19T10:03:00.000Z', stageStartedAt: '2026-11-19T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: false, threads: 2, provider: null, baseline: 100_000, mode: 'vault', pool: [choice], screen: {},
  combos: [{ key: 'vault-1', label: 'Vault Cloak', picks: { back: 'v' }, why: null, by: 'app' }], results: { 'vault-1': { mean: 101_000, error: 40, gain: 1000 } },
  wearNow: null, chase: null, summary: 'Take Vault Cloak: it adds 1,000 damage per second over skipping the vault', notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('Great Vault advisor', () => {
  const page = (character: typeof knight, run: OptimizerRun | null) => {
    const client = new QueryClient()
    if (run) client.setQueryData(['optimizer', 'c1', 'vault'], run)
    return renderToStaticMarkup(<QueryClientProvider client={client}><VaultAdvisor character={character} activity="mythicPlus" scenario="dungeon-slice" load="light" /></QueryClientProvider>)
  }

  it('stays hidden until the addon has seen vault choices', () => {
    expect(page(none, null)).toBe('')
  })

  it('lists the choices, then names the one to take with its gain over skipping', () => {
    expect(page(knight, null)).toContain('Compare my choices')
    const html = page(knight, done)
    expect(html).toContain('Take this')
    expect(html).toContain('+1,000')
    expect(html).toContain('Take Vault Cloak')
  })
})
