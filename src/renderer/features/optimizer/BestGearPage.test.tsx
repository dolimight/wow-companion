import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema, gearItemSchema } from '../../../shared/domain'
import type { OptimizerRun } from '../../../shared/optimizer'
import { Forge, Results } from './BestGearPage'

const mage = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Alwin', className: 'Mage', specName: 'Arcane', specId: 62, gear: [gearItemSchema.parse({ slot: 'head', itemId: 1, name: 'Old Hood', itemLevel: 260 })] })
const run: OptimizerRun = {
  id: 'r1', characterId: 'c1', activity: 'mythicPlus', stage: 'screening', startedAt: '2026-11-18T10:00:00.000Z', finishedAt: null, stageStartedAt: '2026-11-18T10:00:00.000Z',
  scenarioId: 'dungeon-slice', includeTargets: true, threads: 8, provider: 'Claude', baseline: 100_000,
  pool: [
    { key: 'head:3', slot: 'head', item: gearItemSchema.parse({ slot: 'head', itemId: 3, name: 'Bag Hood', itemLevel: 266 }), origin: 'bags', source: null, icon: null, quality: 4, popularity: null },
    { key: 'back:5', slot: 'back', item: gearItemSchema.parse({ slot: 'back', itemId: 5, name: 'Drop Cloak', itemLevel: 285 }), origin: 'drop', source: "Kings' Rest", icon: 9, quality: 4, popularity: .4 },
  ],
  screen: {}, combos: [], results: {}, wearNow: null, chase: null, summary: null, notes: [], failure: null,
}

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('Best gear page', () => {
  it('shows each stage and a slot board while the search runs', () => {
    const html = renderToStaticMarkup(<Forge run={run} />)
    expect(html).toContain('data-stage="screening"')
    expect(html).toContain('Testing each piece')
    expect(html).toContain('2 pieces')
    expect((html.match(/class="forge-slot"/g) ?? []).length + (html.match(/class="forge-slot" data-empty/g) ?? []).length).toBeGreaterThan(0)
  })

  it('shows what to wear now, what to chase, and every set tested', () => {
    const done: OptimizerRun = {
      ...run, stage: 'done', finishedAt: '2026-11-18T10:05:00.000Z', summary: 'Your bag hood is the clearest gain',
      combos: [{ key: 'own', label: 'Best of what you own', picks: { head: 'head:3' }, why: 'Bag hood', by: 'app' }, { key: 'all', label: 'With the drop cloak', picks: { head: 'head:3', back: 'back:5' }, why: 'Both', by: 'ai' }],
      results: { own: { mean: 100_800, error: 40, gain: 800 }, all: { mean: 101_400, error: 40, gain: 1400 } }, wearNow: 'own', chase: 'all',
      screen: { 'head:3': { mean: 100_800, error: 40, gain: 800 }, 'back:5': { mean: 100_600, error: 40, gain: 600 } },
    }
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Results run={done} character={mage} /></QueryClientProvider>)
    expect(html).toContain('Wear now')
    expect(html).toContain('Worth chasing')
    expect(html).toContain('+800')
    expect(html).toContain('+1,400')
    expect(html).toContain('replaces Old Hood')
    expect(html).toContain('Kings&#x27; Rest')
    expect(html).toContain('Your bag hood is the clearest gain')
    // Worth chasing lists each piece with what it adds, not a whole set
    expect(html).toContain('Drop Cloak')
    expect(html).toContain('+600')
    expect(html).not.toContain('Your gear changed')
  })

  it('says when the gear changed since the run', () => {
    const done: OptimizerRun = { ...run, stage: 'done', equipped: [{ slot: 'head', itemId: 1, itemLevel: 250 }] }
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Results run={done} character={mage} /></QueryClientProvider>)
    expect(html).toContain('Your gear changed since this run')
  })

  it('shows a healer what top healers wear instead of engine numbers', () => {
    const priest = { ...mage, className: 'Priest', specName: 'Holy', specId: 257 }
    const healer: OptimizerRun = { ...run, stage: 'done', healer: true, summary: '1 piece worth a look', pool: [{ ...run.pool[1]!, popularity: 0.5 }] }
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Results run={healer} character={priest} /></QueryClientProvider>)
    expect(html).toContain('Worth a look')
    expect(html).toContain('Worn by 50% of top healers')
    expect(html).not.toContain('Every set tested')
  })
})
