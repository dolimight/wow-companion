import { describe, expect, it } from 'vite-plus/test'
import { characterSchema, gearItemSchema, type GearSlot } from '../../shared/domain'
import type { LootItem } from '../../shared/dungeons'
import type { OptimizerRun } from '../../shared/optimizer'
import type { SimulationJob } from '../../shared/simulation'
import { createOptimizer, optimizerThreads, type OptimizerOptions } from './service'

const gear = (slot: GearSlot, itemId: number, itemLevel: number, extra: object = {}) => gearItemSchema.parse({ slot, itemId, name: `Item ${itemId}`, itemLevel, ...extra })
const mage = characterSchema.parse({
  id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Alwin', className: 'Mage', specName: 'Arcane', specId: 62,
  gear: [gear('head', 1, 260, { enchantId: 7 }), gear('back', 2, 260)],
  inventoryObservations: [{ location: 'bags', items: [gear('head', 3, 266)] }, { location: 'vault', items: [gear('back', 4, 272)] }],
})
const cloth: LootItem = { id: 5, name: 'Drop Cloak', quality: 4, slot: 'Back', inventoryType: 16, armor: null, icon: 99, requiredLevel: 0, classId: 4, subclassId: 1, allowableClassMask: -1, specIds: [], primaryStats: ['intellect'] }
const gains: Record<string, number> = { 3: 500, 4: 300, 5: 900 }

/** crash names an item that makes the engine fail: with its profileset in the log, or silently */
function harness(selected: string | null = 'fake', crash: { itemId: number; named: boolean } | null = null) {
  const state = new Map<string, unknown>()
  const started: Array<{ label: string; sets: number; threads: number }> = []
  const jobs = new Map<string, SimulationJob>()
  const options: OptimizerOptions = {
    db: { call: (async (name: string, ...args: unknown[]) => name === 'getCharacter' ? mage : name === 'getFeatureState' ? state.get(String(args[0])) ?? null : name === 'saveFeatureState' ? state.set(String(args[0]), structuredClone(args[2])) : null) as never },
    simulations: {
      startSets: async (input, _top) => {
        const sets = input.sets
        started.push({ label: input.label ?? '', sets: sets.length, threads: input.threads ?? 0 })
        const id = `job-${started.length}`
        const values = [{ name: 'companion_baseline', mean: 100_000, standardError: 50, samples: 100, damageTaken: null }, ...sets.map((set, index) => ({ name: `companion_candidate_${index + 1}`, mean: 100_000 + set.items.reduce((sum, item) => sum + (gains[item.itemId ?? 0] ?? 0), 0), standardError: 40, samples: 100, damageTaken: null }))]
        const bad = crash ? sets.findIndex(set => set.items.some(item => item.itemId === crash.itemId)) : -1
        jobs.set(id, bad >= 0
          ? { id, state: 'failed', result: null, failure: crash!.named ? `SimulationCraft stopped with code 3221225477 — Generating Profileset: companion_candidate_${bad + 1} 60/73 [====>] 658/1500` : 'SimulationCraft stopped with code 1' } as unknown as SimulationJob
          : { id, state: 'completed', result: { values }, failure: null } as unknown as SimulationJob)
        return { job: { id } as SimulationJob, labels: sets.map(set => set.label), skipped: [] }
      },
      waitForJob: async (_character, id) => jobs.get(id)!,
      cancelJob: async () => ({}) as SimulationJob,
    },
    ai: {
      status: async () => ({ selected, providers: [{ id: 'fake', name: 'Fake', description: '', installed: true, version: null, signedIn: true, detail: null }] }),
      ask: (async () => ({ provider: 'Fake', durationMs: 1, value: { combos: [{ label: 'Vault cloak and bag helm', picks: [{ slot: 'head', key: 'missing' }, { slot: 'back', key: 'BACK' }], why: 'Both pieces' }], summary: 'Your bag helm is the clearest gain' } })) as never,
    },
    topPlayers: async () => null,
    drops: () => [{ loot: cloth, source: "Kings' Rest" }],
    changed: async () => {},
  }
  return { optimizer: createOptimizer(options), state, started }
}

async function finished(optimizer: ReturnType<typeof createOptimizer>) {
  for (let at = 0; at < 50; at++) { const run = await optimizer.get('c1'); if (run && ['done', 'failed', 'cancelled'].includes(run.stage)) return run; await new Promise(resolve => setTimeout(resolve, 5)) }
  throw new Error('The run never finished')
}

describe('gear optimizer', () => {
  it('screens each piece, then confirms sets, and names what to wear and what to chase', async () => {
    const { optimizer, started } = harness()
    await optimizer.start({ characterId: 'c1', activity: 'mythicPlus', scenarioId: 'dungeon-slice' })
    const run: OptimizerRun = await finished(optimizer)
    expect(run.stage).toBe('done')
    expect(started.map(entry => entry.label)).toEqual(['Best gear · screening', 'Best gear · confirming'])
    expect(started[0]?.threads).toBe(optimizerThreads('light'))
    expect(run.pool.map(candidate => [candidate.item.itemId, candidate.origin])).toEqual([[3, 'bags'], [4, 'vault'], [5, 'drop']])
    // A bag piece takes the enchant used in its slot
    expect(run.pool[0]?.item.enchantId).toBe(7)
    const wear = run.combos.find(combo => combo.key === run.wearNow)!
    const chase = run.combos.find(combo => combo.key === run.chase)!
    expect(run.results[wear.key]?.gain).toBe(800)
    expect(run.results[chase.key]?.gain).toBe(1400)
    expect(run.summary).toBe('Your bag helm is the clearest gain')
    expect(run.provider).toBe('Fake')
  })

  it('keeps an AI set only when its picks are real candidates', async () => {
    const { optimizer } = harness()
    await optimizer.start({ characterId: 'c1' })
    const run = await finished(optimizer)
    expect(run.combos.some(combo => combo.by === 'ai')).toBe(false)
  })

  it('chooses sets itself without an AI assistant, and owned only when targets are off', async () => {
    const { optimizer } = harness(null)
    await optimizer.start({ characterId: 'c1', includeTargets: false })
    const run = await finished(optimizer)
    expect(run.provider).toBeNull()
    expect(run.pool.every(candidate => candidate.origin !== 'drop')).toBe(true)
    expect(run.chase).toBeNull()
    expect(run.summary).toContain('gains 800 damage per second')
  })

  it('leaves out a piece the engine crashes on, by the profileset its log names, and keeps going', async () => {
    const { optimizer, started } = harness('fake', { itemId: 4, named: true })
    await optimizer.start({ characterId: 'c1' })
    const run = await finished(optimizer)
    expect(run.stage).toBe('done')
    expect(run.notes).toEqual(expect.arrayContaining([expect.stringContaining('Item 4 (272) in Cloak: SimulationCraft crashed while testing it')]))
    expect(Object.keys(run.screen)).toHaveLength(2)
    expect(started.filter(entry => entry.label === 'Best gear · screening').map(entry => entry.sets)).toEqual([3, 2])
  })

  it('finds a silently failing piece by splitting the batch, without failing the run', async () => {
    const { optimizer } = harness(null, { itemId: 5, named: false })
    await optimizer.start({ characterId: 'c1' })
    const run = await finished(optimizer)
    expect(run.stage).toBe('done')
    expect(run.notes).toEqual(expect.arrayContaining([expect.stringContaining('Drop Cloak (334) in Cloak: SimulationCraft stopped with code 1')]))
    expect(run.screen[run.pool.find(candidate => candidate.item.itemId === 3)!.key]?.gain).toBe(500)
  })

  it('finishes with a note, not a failure, when nothing could be measured', async () => {
    const { optimizer } = harness(null, { itemId: 3, named: false })
    await optimizer.start({ characterId: 'c1', includeTargets: false })
    const run = await finished(optimizer)
    expect(run.stage).toBe('done')
    expect(run.failure).toBeNull()
  })

  it('refuses a second run for the same character while one runs', async () => {
    const { optimizer } = harness()
    await optimizer.start({ characterId: 'c1' })
    await expect(optimizer.start({ characterId: 'c1' })).rejects.toThrow('already running')
    await finished(optimizer)
  })
  it('runs light by default and never past half the processor threads', () => {
    expect(optimizerThreads('light', 16)).toBe(2)
    expect(optimizerThreads('medium', 16)).toBe(4)
    expect(optimizerThreads('heavy', 16)).toBe(8)
    expect(optimizerThreads('medium', 4)).toBe(2)
    expect(optimizerThreads('light', 1)).toBe(1)
  })

  it('marks a run cut off by an app or computer restart as stopped, so it can run again', async () => {
    const { optimizer, state } = harness()
    state.set('c1', { id: 'old', characterId: 'c1', stage: 'screening', failure: null, finishedAt: null })
    const run = await optimizer.get('c1')
    expect(run?.stage).toBe('failed')
    expect(run?.failure).toContain('closed before this search finished')
    expect((state.get('c1') as OptimizerRun).stage).toBe('failed')
    await optimizer.start({ characterId: 'c1' })
    expect((await finished(optimizer)).stage).toBe('done')
  })
})
