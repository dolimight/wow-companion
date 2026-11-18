import { availableParallelism } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { AiService } from '../ai/service'
import type { DatabaseClient } from '../database'
import type { SimulationService } from '../simulation/service'
import { ladderCeiling } from '../item-tracks'
import { gearItemSchema, type Character, type GearItem, type GearSlot } from '../../shared/domain'
import type { EncounterBundle, LootItem } from '../../shared/dungeons'
import { gearSlotsForInventoryType } from '../../shared/gamedata'
import { inLootTable, isGearDrop } from '../../shared/loot'
import { bestCombos, candidateKey, greedyCombos, isOwned, optimizerStartSchema, trimPool, wearable, type OptimizerCandidate, type OptimizerCombo, type OptimizerMeasure, type OptimizerOrigin, type OptimizerRun, type OptimizerStart } from '../../shared/optimizer'
import { simulationScenarios, PROFILESET_LIMIT, type SimulationJob } from '../../shared/simulation'
import { capTopLevels, topSlotGroups, type TopPlayers } from '../../shared/top-players'

/** This season's boss loot, bundled by scripts/encounter-data.ts, newest season first */
const encounterFiles = import.meta.glob<EncounterBundle>('../../../data/dungeons/encounters/season-*.json', { eager: true, import: 'default' })
const encounterBundles = Object.values(encounterFiles).filter(Boolean).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))

/** Each drop the activity offers, with the boss and instance it comes from */
export function seasonDrops(activity: string, bundle: EncounterBundle | undefined = encounterBundles[0]): Array<{ loot: LootItem; source: string }> {
  if (!bundle) return []
  const journals = activity === 'raiding' ? Object.values(bundle.raids).map(raid => raid.heroic ?? Object.values(raid)[0]).filter(journal => !!journal) : Object.values(bundle.dungeons)
  const seen = new Set<number>()
  return journals.flatMap(journal => journal!.bosses.flatMap(boss => (boss.loot ?? []).filter(isGearDrop).flatMap(loot => {
    if (seen.has(loot.id)) return []
    seen.add(loot.id)
    return [{ loot, source: activity === 'raiding' ? `${boss.name} · ${journal!.name}` : journal!.name }]
  })))
}

const screenIterations = 1500
const confirmIterations = 6000
/** Half the processor threads, so the computer stays usable while the engine runs */
export const optimizerThreads = () => Math.max(1, Math.floor(availableParallelism() / 2))

export type OptimizerOptions = {
  db: Pick<DatabaseClient, 'call'>
  simulations: Pick<SimulationService, 'startSets' | 'waitForJob' | 'cancelJob'>
  ai: Pick<AiService, 'status' | 'ask'>
  topPlayers: (character: Character) => Promise<TopPlayers | null>
  items?: (ids: number[]) => Promise<Array<{ id: number; icon: number | null; quality: number }>>
  drops?: (activity: string) => Array<{ loot: LootItem; source: string }>
  changed: (characterId: string) => Promise<void>
  now?: () => Date
}

export function createOptimizer(options: OptimizerOptions) {
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const active = new Map<string, { run: OptimizerRun; cancelled: boolean; job: string | null }>()

  async function save(run: OptimizerRun) {
    await options.db.call('saveFeatureState', run.characterId, 'optimizer', run)
    await options.changed(run.characterId)
  }
  async function stage(run: OptimizerRun, next: OptimizerRun['stage']) { run.stage = next; run.stageStartedAt = now(); await save(run) }

  /** Owned pieces from bags, bank, and the vault, plus drops and top-player items when targets are on */
  async function gather(character: Character, start: ReturnType<typeof optimizerStartSchema.parse>, top: TopPlayers | null): Promise<OptimizerCandidate[]> {
    const pool: OptimizerCandidate[] = []
    const worn = new Map(character.gear.map(item => [item.slot, item]))
    const twoHanded = worn.get('mainHand')?.inventoryType === 17
    const add = (item: GearItem, origin: OptimizerOrigin, source: string | null, slots: GearSlot[], extra: Partial<OptimizerCandidate> = {}) => {
      for (const slot of slots) {
        // Weapons stay the shape you wear: a two-hander for a two-hander, one-handers and off hands otherwise
        if ((slot === 'mainHand' || slot === 'offHand') && (twoHanded ? item.inventoryType !== 17 || slot === 'offHand' : item.inventoryType === 17)) continue
        const current = worn.get(slot)
        // Owned pieces take the enchant you use in that slot, as you'd move it over
        const enchanted = isOwned({ origin }) && item.enchantId == null && !item.enchant ? { enchant: current?.enchant ?? null, enchantId: current?.enchantId ?? null } : {}
        pool.push({ key: candidateKey(slot, item, origin, pool.length), slot, item: { ...item, ...enchanted, slot }, origin, source, icon: null, quality: null, popularity: null, ...extra })
      }
    }
    for (const observation of character.inventoryObservations ?? []) {
      if (observation.location === 'equipped') continue
      for (const item of observation.items) {
        if (!item.itemId || item.itemLevel == null) continue
        const slots = item.inventoryType != null ? gearSlotsForInventoryType(item.inventoryType) : [item.slot]
        add(item, observation.location, observation.location === 'vault' ? 'Claim it from the Great Vault' : null, slots.length ? slots : [item.slot])
      }
    }
    if (start.includeTargets) {
      const level = ladderCeiling
      const popular = new Map<number, number>()
      if (top?.gearPlayers) for (const group of Object.values(top.slots)) for (const entry of group?.items ?? []) popular.set(entry.id, Math.max(popular.get(entry.id) ?? 0, entry.count / top.gearPlayers))
      const who = { className: character.className, specId: character.specId, level: null }
      for (const { loot, source } of (options.drops ?? seasonDrops)(start.activity)) {
        if (!inLootTable(loot, who) || level == null) continue
        const item = gearItemSchema.parse({ slot: gearSlotsForInventoryType(loot.inventoryType)[0] ?? 'head', itemId: loot.id, name: loot.name, itemLevel: level, inventoryType: loot.inventoryType, classId: loot.classId, subclassId: loot.subclassId, allowableClassMask: loot.allowableClassMask ?? null, specIds: loot.specIds ?? null, primaryStats: loot.primaryStats ?? null, levelSource: 'estimated' })
        add(item, 'drop', source, gearSlotsForInventoryType(loot.inventoryType), { icon: loot.icon, quality: loot.quality, popularity: popular.get(loot.id) ?? null })
      }
      // Top players' most worn pieces, at the level they wear them, when no drop already covers them
      for (const group of topSlotGroups) {
        const entries = top?.slots[group.group]?.items ?? []
        for (const entry of entries.slice(0, 3)) {
          if (pool.some(candidate => candidate.item.itemId === entry.id)) continue
          const copy = entry.copy
          const item = gearItemSchema.parse({ slot: group.slots[0]!, itemId: entry.id, name: entry.name, itemLevel: copy?.itemLevel ?? entry.level ?? level ?? null, bonusIds: copy?.bonusIds.length ? copy.bonusIds : null, levelSource: 'observed' })
          if (item.itemLevel == null) continue
          add(item, 'top', `Worn by ${entry.count} of ${top!.gearPlayers} top players`, group.slots, { popularity: top!.gearPlayers ? entry.count / top!.gearPlayers : null })
        }
      }
    }
    const trimmed = trimPool(pool, character)
    // Icons and quality for pieces the bundle doesn't describe come from the game files when they are ready
    const missing = [...new Set(trimmed.filter(candidate => candidate.icon == null).map(candidate => candidate.item.itemId!))]
    const found = missing.length && options.items ? new Map((await options.items(missing).catch(() => [])).map(info => [info.id, info])) : new Map()
    return trimmed.map(candidate => { const info = found.get(candidate.item.itemId!); return info ? { ...candidate, icon: info.icon, quality: info.quality } : candidate })
  }

  /** Runs sets through SimulationCraft in jobs within its profileset limit, returning each label's measure */
  async function measure(run: OptimizerRun, character: Character, sets: Array<{ label: string; items: GearItem[] }>, iterations: number, label: string, top: TopPlayers | null) {
    const measures: Record<string, OptimizerMeasure> = {}
    for (let at = 0; at < sets.length; at += PROFILESET_LIMIT - 1) {
      const state = active.get(run.characterId)
      if (state?.cancelled) throw new Error('Cancelled')
      const { job, labels, skipped } = await options.simulations.startSets({ characterId: character.id, activity: run.activity, scenarioId: run.scenarioId, iterations, threads: run.threads, timeoutMinutes: 60, label, sets: sets.slice(at, at + PROFILESET_LIMIT - 1) }, top)
      for (const entry of skipped) run.notes.push(`${entry.label}: ${entry.reason}`)
      if (state) state.job = job.id
      const done: SimulationJob = await options.simulations.waitForJob(character.id, job.id)
      if (state) state.job = null
      if (done.state !== 'completed' || !done.result) throw new Error(done.failure ?? 'The simulation did not finish')
      const [base, ...values] = done.result.values
      run.baseline ??= base!.mean
      labels.forEach((name, index) => { const value = values[index]; if (value) measures[name] = { mean: value.mean, error: value.standardError, gain: value.mean - base!.mean } })
    }
    return measures
  }

  /** The assistant's sets, kept only when every pick is a real candidate for that slot and the set can be worn */
  async function aiCombos(run: OptimizerRun, character: Character): Promise<{ combos: OptimizerCombo[]; summary: string | null }> {
    const status = await options.ai.status().catch(() => null)
    const provider = status?.providers.find(entry => entry.id === status.selected && entry.signedIn)
    if (!provider) return { combos: [], summary: null }
    const byKey = new Map(run.pool.map(candidate => [candidate.key, candidate]))
    const base = run.baseline ?? 1
    const answer = await options.ai.ask('gearCombos', {
      characterId: character.id,
      scenario: simulationScenarios[run.scenarioId].label,
      equipped: character.gear.map(item => ({ slot: item.slot, name: item.name, itemLevel: item.itemLevel })),
      candidates: run.pool.filter(candidate => run.screen[candidate.key]).slice(0, 240).map(candidate => ({ key: candidate.key, slot: candidate.slot, name: candidate.item.name, itemLevel: candidate.item.itemLevel, origin: candidate.source ?? candidate.origin, gainPercent: run.screen[candidate.key]!.gain / base * 100, popularity: candidate.popularity })),
      rules: ['At most one Great Vault choice per set', 'The same ring or trinket can\'t fill both of its slots', 'Unique-equipped items can\'t be worn together', 'Leave a slot out to keep what is equipped there'],
    })
    run.provider = answer.provider
    const combos: OptimizerCombo[] = []
    answer.value.combos.forEach((combo, index) => {
      const picks: Partial<Record<GearSlot, string>> = {}
      for (const pick of combo.picks) { const candidate = byKey.get(pick.key); if (candidate && candidate.slot === pick.slot) picks[candidate.slot] = candidate.key }
      if (Object.keys(picks).length && wearable(picks, byKey)) combos.push({ key: `ai-${index + 1}`, label: combo.label, picks, why: combo.why, by: 'ai' })
    })
    return { combos, summary: answer.value.summary || null }
  }

  async function execute(run: OptimizerRun, start: ReturnType<typeof optimizerStartSchema.parse>) {
    const character = await options.db.call('getCharacter', run.characterId) as Character | null
    if (!character) throw new Error('Character was not found')
    const top = await options.topPlayers(character).catch(() => null)
    const capped = top ? capTopLevels(top, ladderCeiling) : null
    run.pool = await gather(character, start, capped)
    if (!run.pool.length) throw new Error('Nothing to compare yet · sync your bags and bank with the addon, or include targets')
    await stage(run, 'screening')
    run.screen = await measure(run, character, run.pool.map(candidate => ({ label: candidate.key, items: [candidate.item] })), screenIterations, 'Best gear · screening', capped)
    await stage(run, 'choosing')
    const byKey = new Map(run.pool.map(candidate => [candidate.key, candidate]))
    const fromAi = await aiCombos(run, character).catch(error => { run.notes.push(`The AI assistant couldn't choose sets: ${(error as Error).message}`); return { combos: [], summary: null } })
    const combos = [...greedyCombos(run.pool, run.screen), ...fromAi.combos]
    run.combos = combos.filter((combo, index) => combos.findIndex(other => JSON.stringify(other.picks) === JSON.stringify(combo.picks)) === index).slice(0, 24)
    run.summary = fromAi.summary
    if (!run.combos.length) throw new Error('No piece beat what you wear in screening')
    await stage(run, 'confirming')
    run.results = await measure(run, character, run.combos.map(combo => ({ label: combo.key, items: Object.values(combo.picks).map(key => byKey.get(key!)!.item) })), confirmIterations, 'Best gear · confirming', capped)
    Object.assign(run, bestCombos(run.combos, run.results, byKey))
    if (!run.summary) {
      const owned = run.combos.find(combo => combo.key === run.wearNow)
      run.summary = owned ? `${owned.label} gains ${Math.round(run.results[owned.key]!.gain).toLocaleString('en-US')} damage per second from gear you own` : 'Nothing you own beats what you wear now in this fight'
    }
    run.finishedAt = now()
    await stage(run, 'done')
  }

  return {
    async get(characterId: string): Promise<OptimizerRun | null> {
      return active.get(characterId)?.run ?? (await options.db.call('getFeatureState', characterId, 'optimizer') as OptimizerRun | null) ?? null
    },
    async start(input: OptimizerStart): Promise<OptimizerRun> {
      const start = optimizerStartSchema.parse(input)
      if (active.has(start.characterId)) throw new Error('Gear optimization is already running for this character')
      const run: OptimizerRun = { id: randomUUID(), characterId: start.characterId, activity: start.activity, stage: 'gathering', startedAt: now(), finishedAt: null, stageStartedAt: now(), scenarioId: start.scenarioId, includeTargets: start.includeTargets, threads: optimizerThreads(), provider: null, baseline: null, pool: [], screen: {}, combos: [], results: {}, wearNow: null, chase: null, summary: null, notes: [], failure: null }
      active.set(run.characterId, { run, cancelled: false, job: null })
      await save(run)
      void execute(run, start).catch(async error => {
        const cancelled = active.get(run.characterId)?.cancelled
        run.stage = cancelled ? 'cancelled' : 'failed'
        run.failure = cancelled ? null : (error as Error).message
        run.finishedAt = now()
        await save(run).catch(() => {})
      }).finally(() => active.delete(run.characterId))
      return run
    },
    async cancel(characterId: string) {
      const state = active.get(characterId)
      if (!state) return
      state.cancelled = true
      if (state.job) await options.simulations.cancelJob(characterId, state.job).catch(() => {})
    },
  }
}

export type Optimizer = ReturnType<typeof createOptimizer>
