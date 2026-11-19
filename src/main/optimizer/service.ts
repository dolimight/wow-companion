import { availableParallelism } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { AiService } from '../ai/service'
import type { DatabaseClient } from '../database'
import type { SimulationService } from '../simulation/service'
import { ladderCeiling, trackStartLevel } from '../item-tracks'
import { gearItemSchema, type Character, type GearItem, type GearSlot } from '../../shared/domain'
import type { EncounterBundle, LootItem } from '../../shared/dungeons'
import { gearSlotsForInventoryType } from '../../shared/gamedata'
import { inLootTable, isGearDrop, uniqueDrops } from '../../shared/loot'
import { bestCombos, lootSources, optimizerTrackNames, vaultChoices, vaultSets, candidateKey, greedyCombos, isOwned, noise, optimizerLoads, tankSpecs, optimizerStartSchema, trimPool, wearable, type OptimizerCandidate, type OptimizerCombo, type OptimizerLoad, type OptimizerMeasure, type OptimizerOrigin, type OptimizerRun, type OptimizerStart, type OptimizerMode } from '../../shared/optimizer'
import { simulationScenarios, PROFILESET_LIMIT, type SimulationJob } from '../../shared/simulation'
import { capTopLevels, topSlotGroups, type TopPlayers } from '../../shared/top-players'
import { gearSlotLabels } from '../../shared/simulation-benchmark'
import { log } from '../log'
import { pruneCache, screenKey, type ScreenCache } from './cache'

/** This season's boss loot, bundled by scripts/encounter-data.ts, newest season first */
const encounterFiles = import.meta.glob<EncounterBundle>('../../../data/dungeons/encounters/season-*.json', { eager: true, import: 'default' })
const encounterBundles = Object.values(encounterFiles).filter(Boolean).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))

/** Each drop the activity offers, with the boss and instance it comes from */
export function seasonDrops(activity: string, bundle: EncounterBundle | undefined = encounterBundles[0]): Array<{ loot: LootItem; source: string; instance?: string; boss?: string | null }> {
  if (!bundle) return []
  const journals = activity === 'raiding' ? Object.values(bundle.raids).map(raid => raid.heroic ?? Object.values(raid)[0]).filter(journal => !!journal) : Object.values(bundle.dungeons)
  const seen = new Set<number>()
  return journals.flatMap(journal => {
    const all = journal!.bosses.flatMap(boss => (boss.loot ?? []).map(loot => ({ loot, boss: boss.name })))
    // A dungeon from an older expansion lists the old item beside its reissue; only the reissue drops this season
    const current = new Set(uniqueDrops(all.map(entry => entry.loot)))
    return all.filter(entry => current.has(entry.loot) && isGearDrop(entry.loot) && !seen.has(entry.loot.id)).map(entry => {
      seen.add(entry.loot.id)
      return { loot: entry.loot, source: activity === 'raiding' ? `${entry.boss} · ${journal!.name}` : journal!.name, instance: journal!.name, boss: activity === 'raiding' ? entry.boss : null }
    })
  })
}

/** The set the engine was building when it stopped, from the last profileset its log names */
export function crashedSet(failure: string | null, labels: string[]): string | null {
  const names = [...(failure ?? '').matchAll(/companion_candidate_(\d+)/g)]
  const index = names.length ? Number(names.at(-1)![1]) - 1 : -1
  return labels[index] ?? null
}

/** One readable line for a failed engine run, without the progress log it ends with */
export function engineFailure(failure: string | null, set: string | null): string {
  const code = failure?.match(/stopped with code (\d+)/)?.[1]
  if (code === '3221225477' || code === '139') return `SimulationCraft crashed${set ? ` while testing ${set}` : ''}. Update SimulationCraft, or try again without targets`
  return (failure ?? 'The simulation did not finish').split(' — ')[0]!.slice(0, 300)
}

const screenIterations = 1500
const confirmIterations = 6000
/** Threads for a load: light and medium are fixed counts, heavy is half the processor threads; never more than half */
export const optimizerThreads = (load: OptimizerLoad = 'light', available = availableParallelism()) => {
  const half = Math.max(1, Math.floor(available / 2))
  return Math.min(half, optimizerLoads[load].threads ?? half)
}

export type OptimizerOptions = {
  db: Pick<DatabaseClient, 'call'>
  simulations: Pick<SimulationService, 'startSets' | 'waitForJob' | 'cancelJob'> & Partial<Pick<SimulationService, 'engineHash'>>
  ai: Pick<AiService, 'status' | 'ask'>
  topPlayers: (character: Character) => Promise<TopPlayers | null>
  items?: (ids: number[]) => Promise<Array<{ id: number; icon: number | null; quality: number }>>
  drops?: (activity: string) => Array<{ loot: LootItem; source: string; instance?: string; boss?: string | null }>
  changed: (characterId: string) => Promise<void>
  now?: () => Date
}

/** Best gear and the loot finder keep their last runs apart */
const space = (mode: OptimizerMode | undefined) => mode === 'loot' ? 'optimizer-loot' : mode === 'vault' ? 'optimizer-vault' : 'optimizer'
const modeNames: Record<OptimizerMode, string> = { gear: 'Best gear', loot: 'The loot finder', vault: 'The vault advisor' }

export function createOptimizer(options: OptimizerOptions) {
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const active = new Map<string, { run: OptimizerRun; cancelled: boolean; job: string | null }>()

  async function save(run: OptimizerRun) {
    await options.db.call('saveFeatureState', run.characterId, space(run.mode), run)
    await options.changed(run.characterId)
  }
  async function stage(run: OptimizerRun, next: OptimizerRun['stage']) { run.stage = next; run.stageStartedAt = now(); log.info('optimizer', `Best gear: ${next}`, { run: run.id }); await save(run) }

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
    // The loot finder measures only drops, so what you own stays out of its pool
    for (const observation of start.mode === 'loot' ? [] : character.inventoryObservations ?? []) {
      if (observation.location === 'equipped') continue
      for (const item of observation.items) {
        if (!item.itemId || item.itemLevel == null) continue
        const slots = item.inventoryType != null ? gearSlotsForInventoryType(item.inventoryType) : [item.slot]
        add(item, observation.location, observation.location === 'vault' ? 'Claim it from the Great Vault' : null, slots.length ? slots : [item.slot])
      }
    }
    if ((start.includeTargets && start.mode === 'gear') || start.mode === 'loot') {
      const level = start.mode === 'loot' ? trackStartLevel(optimizerTrackNames[start.track]) : ladderCeiling
      const popular = new Map<number, number>()
      if (top?.gearPlayers) for (const group of Object.values(top.slots)) for (const entry of group?.items ?? []) popular.set(entry.id, Math.max(popular.get(entry.id) ?? 0, entry.count / top.gearPlayers))
      const who = { className: character.className, specId: character.specId, level: null }
      for (const { loot, source, instance, boss } of (options.drops ?? seasonDrops)(start.activity)) {
        if (!inLootTable(loot, who) || level == null) continue
        const item = gearItemSchema.parse({ slot: gearSlotsForInventoryType(loot.inventoryType)[0] ?? 'head', itemId: loot.id, name: loot.name, itemLevel: level, inventoryType: loot.inventoryType, classId: loot.classId, subclassId: loot.subclassId, allowableClassMask: loot.allowableClassMask ?? null, specIds: loot.specIds ?? null, primaryStats: loot.primaryStats ?? null, levelSource: 'estimated' })
        add(item, 'drop', source, gearSlotsForInventoryType(loot.inventoryType), { icon: loot.icon, quality: loot.quality, popularity: popular.get(loot.id) ?? null, instance: instance ?? source, boss: boss ?? null })
      }
      // Top players' most worn pieces, at the level they wear them, when no drop already covers them
      for (const group of start.mode === 'loot' ? [] : topSlotGroups) {
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
    // The loot finder keeps every drop: it ranks where to farm, so no slot's list is cut short
    const trimmed = trimPool(pool, character, start.mode === 'loot' ? 200 : undefined)
    // Icons and quality for pieces the bundle doesn't describe come from the game files when they are ready
    const missing = [...new Set(trimmed.filter(candidate => candidate.icon == null).map(candidate => candidate.item.itemId!))]
    const found = missing.length && options.items ? new Map((await options.items(missing).catch(() => [])).map(info => [info.id, info])) : new Map()
    return trimmed.map(candidate => { const info = found.get(candidate.item.itemId!); return info ? { ...candidate, icon: info.icon, quality: info.quality } : candidate })
  }

  /**
   * Runs sets through SimulationCraft in jobs within its profileset limit, returning each label's measure. An engine
   * failure never ends the run: when its log names the set it was building, that set is left out and the rest run
   * again; otherwise the batch is split in half until the failing set is found. Each skipped set gets a note and a log
   * line. Only a setup problem, such as no engine chosen, or the player stopping the run ends it early
   */
  /** Screening results saved from earlier runs, by what each depends on; null when there is no engine to key them by */
  async function cachedScreen(run: OptimizerRun, character: Character, sets: Array<{ label: string; items: GearItem[] }>, iterations: number) {
    const engine = await options.simulations.engineHash?.().catch(() => null) ?? null
    if (!engine) return null
    const cache = (await options.db.call('getFeatureState', character.id, 'optimizer-cache') as ScreenCache | null) ?? { entries: {} }
    const keys = new Map(sets.map(set => [set.label, screenKey(character, set.items, run.scenarioId, iterations, engine)]))
    return { cache, keys }
  }

  async function measure(run: OptimizerRun, character: Character, allSets: Array<{ label: string; items: GearItem[] }>, iterations: number, label: string, top: TopPlayers | null, describe: (label: string) => string, reuse = false) {
    const measures: Record<string, OptimizerMeasure> = {}
    // A piece measured before against the same gear, talents, fight, and engine isn't run again
    const saved = reuse ? await cachedScreen(run, character, allSets, iterations) : null
    const sets = allSets.filter(set => {
      const hit = saved?.cache.entries[saved.keys.get(set.label)!]
      if (!hit) return true
      measures[set.label] = { mean: hit.mean, error: hit.error, gain: hit.gain }
      run.baseline ??= hit.mean - hit.gain
      run.reused = (run.reused ?? 0) + 1
      return false
    })
    if (saved && run.reused) log.info('optimizer', `${label}: reused ${run.reused} earlier results`, { run: run.id })
    const queue: Array<typeof sets> = []
    for (let at = 0; at < sets.length; at += PROFILESET_LIMIT - 1) queue.push(sets.slice(at, at + PROFILESET_LIMIT - 1))
    const skip = (set: { label: string }, reason: string) => { run.notes.push(`${describe(set.label)}: ${reason}`); log.warn('optimizer', `${label}: skipped ${describe(set.label)}`, { reason }) }
    // Splitting can't go on forever: past this many engine runs, whatever is left is noted as skipped
    let budget = 40
    while (queue.length) {
      const batch = queue.shift()!
      const state = active.get(run.characterId)
      if (state?.cancelled) throw new Error('Cancelled')
      if (budget-- <= 0) { for (const set of batch) skip(set, 'Left out after repeated SimulationCraft failures'); continue }
      const { job, labels, skipped } = await options.simulations.startSets({ characterId: character.id, activity: run.activity, scenarioId: run.scenarioId, iterations, threads: run.threads, timeoutMinutes: 60, label, sets: batch }, top)
      for (const entry of skipped) skip(entry, entry.reason)
      if (!job) continue
      if (state) state.job = job.id
      const done: SimulationJob = await options.simulations.waitForJob(character.id, job.id)
      if (state) state.job = null
      if (done.state === 'completed' && done.result) {
        const [base, ...values] = done.result.values
        run.baseline ??= base!.mean
        labels.forEach((name, index) => { const value = values[index]; if (value) measures[name] = { mean: value.mean, error: value.standardError, gain: value.mean - base!.mean } })
        continue
      }
      if (state?.cancelled || done.state === 'cancelled') throw new Error('Cancelled')
      log.error('optimizer', `${label}: SimulationCraft failed on a batch of ${labels.length}`, { job: job.id, failure: done.failure })
      const runnable = batch.filter(set => labels.includes(set.label))
      const crashed = crashedSet(done.failure, labels)
      if (crashed) {
        skip({ label: crashed }, 'SimulationCraft crashed while testing it, so it was left out')
        const rest = runnable.filter(set => set.label !== crashed)
        if (rest.length) queue.unshift(rest)
      } else if (runnable.length > 1) {
        const half = Math.ceil(runnable.length / 2)
        queue.unshift(runnable.slice(0, half), runnable.slice(half))
      } else if (runnable[0]) skip(runnable[0], engineFailure(done.failure, null))
    }
    if (saved) {
      const at = now()
      for (const set of sets) { const value = measures[set.label]; if (value) saved.cache.entries[saved.keys.get(set.label)!] = { ...value, at } }
      await options.db.call('saveFeatureState', character.id, 'optimizer-cache', pruneCache(saved.cache, new Date(at)))
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
      candidates: run.pool.filter(candidate => run.screen[candidate.key]).slice(0, 240).map(candidate => ({ key: candidate.key, slot: candidate.slot, name: candidate.item.name, itemLevel: candidate.item.itemLevel, origin: `${isOwned(candidate) ? 'owned' : 'target'}: ${candidate.source ?? candidate.origin}`.slice(0, 120), gainPercent: run.screen[candidate.key]!.gain / base * 100, noisePercent: noise(run.screen[candidate.key]!) / base * 100, popularity: candidate.popularity })),
      rules: ['At most one Great Vault choice per set', 'The same ring or trinket can\'t fill both of its slots', 'Unique-equipped items can\'t be worn together', 'Leave a slot out to keep what is equipped there', ...(tankSpecs.includes(character.specName) ? ['This is a tank: never swap out a defensive trinket for damage alone'] : [])],
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
    // Gear saved above anything this season offers is out of date, so every comparison against it is too
    const stale = ladderCeiling != null ? character.gear.filter(item => (item.itemLevel ?? 0) > ladderCeiling!) : []
    run.equipped = character.gear.map(item => ({ slot: item.slot, itemId: item.itemId, itemLevel: item.itemLevel }))
    if (stale.length) run.warning = `Your saved ${stale.slice(0, 3).map(item => `${gearSlotLabels[item.slot].toLowerCase()} (${item.itemLevel})`).join(', ')} ${stale.length === 1 ? 'is' : 'are'} above this season's highest item level ${ladderCeiling}, so your saved gear is out of date. Refresh the character, then run this again`
    // A tank's gear also keeps them alive, which a damage simulation can't see
    if (tankSpecs.includes(character.specName)) run.warning = [run.warning, `SimulationCraft measures damage, not survival. As a ${character.specName} tank, keep the defensive trinkets and pieces you rely on, even where a swap shows more damage`].filter(Boolean).join(' · ')
    run.pool = await gather(character, start, capped)
    if (start.mode === 'loot') return findLoot(run, character, capped)
    if (start.mode === 'vault') return adviseVault(run, character, capped)
    if (!run.pool.length) throw new Error('Nothing to compare yet · sync your bags and bank with the addon, or include targets')
    await stage(run, 'screening')
    run.screen = await measure(run, character, run.pool.map(candidate => ({ label: candidate.key, items: [candidate.item] })), screenIterations, 'Best gear · screening', capped, key => { const candidate = run.pool.find(entry => entry.key === key); return candidate ? `${candidate.item.name} (${candidate.item.itemLevel}) in ${gearSlotLabels[candidate.slot]}` : key }, true)
    await stage(run, 'choosing')
    const byKey = new Map(run.pool.map(candidate => [candidate.key, candidate]))
    const fromAi = await aiCombos(run, character).catch(error => { run.notes.push(`The AI assistant couldn't choose sets, so the app chose them: ${(error as Error).message}`); log.warn('optimizer', 'AI set choice failed', error); return { combos: [], summary: null } })
    const combos = [...greedyCombos(run.pool, run.screen), ...fromAi.combos]
    run.combos = combos.filter((combo, index) => combos.findIndex(other => JSON.stringify(other.picks) === JSON.stringify(combo.picks)) === index).slice(0, 24)
    run.summary = fromAi.summary
    // Nothing worth confirming is a finished search, not a failed one
    if (!run.combos.length) return finish(run, Object.keys(run.screen).length ? 'Nothing beat what you wear in this fight' : 'SimulationCraft couldn\'t measure any piece this time · the notes below say why')
    await stage(run, 'confirming')
    run.results = await measure(run, character, run.combos.map(combo => ({ label: combo.key, items: Object.values(combo.picks).map(key => byKey.get(key!)!.item) })), confirmIterations, 'Best gear · confirming', capped, key => run.combos.find(combo => combo.key === key)?.label ?? key)
    Object.assign(run, bestCombos(run.combos, run.results, byKey))
    if (!run.summary) {
      const owned = run.combos.find(combo => combo.key === run.wearNow)
      run.summary = owned ? `${owned.label} gains ${Math.round(run.results[owned.key]!.gain).toLocaleString('en-US')} damage per second from gear you own` : 'Nothing you own beats what you wear now in this fight'
    }
    await finish(run, run.summary)
  }

  /** The loot finder: every drop screened alone at the chosen track's level, then ranked by where it drops */
  async function findLoot(run: OptimizerRun, character: Character, top: TopPlayers | null) {
    if (!run.trackLevel) throw new Error("This season's upgrade tracks are missing from the app's data")
    if (!run.pool.length) throw new Error('No drop this season fits your class and specialization')
    await stage(run, 'screening')
    run.screen = await measure(run, character, run.pool.map(candidate => ({ label: candidate.key, items: [candidate.item] })), screenIterations, 'Loot finder · screening', top, key => { const candidate = run.pool.find(entry => entry.key === key); return candidate ? `${candidate.item.name} (${candidate.item.itemLevel}) in ${gearSlotLabels[candidate.slot]}` : key }, true)
    const best = lootSources(run)[0]
    await finish(run, best ? `${best.boss ? `${best.boss} in ${best.instance}` : best.instance} has the most for you: ${best.pieces.length} ${best.pieces.length === 1 ? 'piece' : 'pieces'} worth ${Math.round(best.total).toLocaleString('en-US')} damage per second together` : 'No drop at this level clearly beats what you wear')
  }

  /** The vault advisor: what you own screened, then each vault choice confirmed in the best owned set, beside skipping it */
  async function adviseVault(run: OptimizerRun, character: Character, top: TopPlayers | null) {
    if (!run.pool.some(candidate => candidate.origin === 'vault')) throw new Error('No Great Vault choices seen yet · open the Great Vault in game, then /reload so the addon saves them')
    await stage(run, 'screening')
    run.screen = await measure(run, character, run.pool.map(candidate => ({ label: candidate.key, items: [candidate.item] })), screenIterations, 'Vault advisor · screening', top, key => { const candidate = run.pool.find(entry => entry.key === key); return candidate ? `${candidate.item.name} (${candidate.item.itemLevel}) in ${gearSlotLabels[candidate.slot]}` : key }, true)
    await stage(run, 'choosing')
    run.combos = vaultSets(run.pool, run.screen)
    await stage(run, 'confirming')
    const byKey = new Map(run.pool.map(candidate => [candidate.key, candidate]))
    run.results = await measure(run, character, run.combos.map(combo => ({ label: combo.key, items: Object.values(combo.picks).map(key => byKey.get(key!)!.item) })), confirmIterations, 'Vault advisor · confirming', top, key => run.combos.find(combo => combo.key === key)?.label ?? key)
    const { take, choices } = vaultChoices(run)
    await finish(run, take ? `Take ${take.candidate.item.name}: it adds ${Math.round(take.over).toLocaleString('en-US')} damage per second over skipping the vault` : choices.length ? 'No vault choice clearly beats the best of what you own · take the one you can upgrade furthest, or sell it for gold' : 'SimulationCraft could not measure the vault choices this time · the notes below say why')
  }

  async function finish(run: OptimizerRun, summary: string | null) {
    run.summary = summary
    run.finishedAt = now()
    log.info('optimizer', 'Best gear finished', { run: run.id, pieces: run.pool.length, measured: Object.keys(run.screen).length, sets: run.combos.length, skipped: run.notes.length, wearNow: run.wearNow, chase: run.chase })
    await stage(run, 'done')
  }

  return {
    async get(characterId: string, mode: OptimizerMode = 'gear'): Promise<OptimizerRun | null> {
      const live = active.get(characterId)?.run
      if (live && (live.mode ?? 'gear') === mode) return live
      const saved = (await options.db.call('getFeatureState', characterId, space(mode)) as OptimizerRun | null) ?? null
      // A run saved mid-search that this session isn't running was cut off when the app or computer stopped
      if (saved && ['gathering', 'screening', 'choosing', 'confirming'].includes(saved.stage) && !live) {
        saved.stage = 'failed'
        saved.failure = 'The app closed before this search finished. Run it again'
        saved.finishedAt = now()
        log.warn('optimizer', 'Best gear run was cut off when the app closed', { run: saved.id })
        await save(saved)
      }
      return saved
    },
    async start(input: OptimizerStart): Promise<OptimizerRun> {
      const start = optimizerStartSchema.parse(input)
      if (active.has(start.characterId)) throw new Error(`${modeNames[active.get(start.characterId)!.run.mode ?? 'gear']} is already running for this character`)
      const run: OptimizerRun = { id: randomUUID(), characterId: start.characterId, activity: start.activity, stage: 'gathering', startedAt: now(), finishedAt: null, stageStartedAt: now(), scenarioId: start.scenarioId, includeTargets: start.includeTargets, mode: start.mode, track: start.track, trackLevel: start.mode === 'loot' ? trackStartLevel(optimizerTrackNames[start.track]) : null, threads: optimizerThreads(start.load), provider: null, baseline: null, pool: [], screen: {}, combos: [], results: {}, wearNow: null, chase: null, summary: null, notes: [], failure: null }
      active.set(run.characterId, { run, cancelled: false, job: null })
      await save(run)
      void execute(run, start).catch(async error => {
        const cancelled = active.get(run.characterId)?.cancelled
        if (!cancelled) log.error('optimizer', 'Best gear stopped', error)
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
