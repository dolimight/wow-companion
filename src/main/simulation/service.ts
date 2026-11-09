import { availableParallelism } from 'node:os'
import path from 'node:path'
import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Character, GearItem } from '../../shared/domain'
import type { DatabaseClient } from '../database'
import { baselineFromCharacter, toItemVariant } from '../../shared/gear-variants'
import { getItemCompatibility } from '../../shared/item-compatibility'
import { asCompatibilityItem } from '../../shared/gear-set-validation'
import { validateGearSet } from '../../shared/gear-set-validation'
import { resolveSeasonRuleset } from '../../shared/season-rules'
import { loadBundledProgressionRules } from '../progression/service'
import { benchmarkLabels, benchmarkPlan, gearSlotLabels, planSwaps } from '../../shared/simulation-benchmark'
import type { TopPlayers } from '../../shared/top-players'
import { classifySimulationResult, resolveScenario, simulationBenchmarkStartSchema, simulationPlanStartSchema, simulationStartSchema, simulationStoredWorkspaceSchema, simulationSwapsStartSchema, type SimulationJob, type SimulationRequest, type SimulationWorkspace, type SimulationStart, type SimulationSwapsStart, type SimulationBenchmarkStart, type SimulationPlanStart } from '../../shared/simulation'
import { characterBaselineHash, classToken, exportCharacterProfile, hash, healerSpecs, importCharacterProfile, itemLine, parseSimulationProfile, tankSpecs } from './profiles'
import { parseSimulationReport, REFERENCE_PROFILESET, runSimulationProcess, type SimulationProcess } from './runner'

type SimulationDatabase = Pick<DatabaseClient, 'call'>
type Executable = { path: string; name: string; hash: string }
const engineName = process.platform === 'win32' ? 'simc.exe' : 'simc'
/** The SimulationCraft desktop app ships beside the command-line engine, so a pick of the app resolves to the engine next to it */
async function commandLineEngine(selected: string) {
  if (!/^simulationcraft(\.exe)?$/i.test(path.basename(selected))) return selected
  const sibling = path.join(path.dirname(selected), engineName)
  try { if ((await stat(sibling)).isFile()) return sibling } catch { /* reported below */ }
  throw new Error(`Choose ${engineName}, the command-line engine that comes with SimulationCraft`)
}
/** Where the file picker opens: the configured engine, else the newest SimulationCraft folder in a usual install place */
export async function engineFolder(configured: string | null, roots: string[]) {
  if (configured) return path.dirname(configured)
  for (const root of roots) {
    try {
      const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^simc/i.test(entry.name)).map(entry => entry.name).sort().reverse()
      for (const folder of folders) { const candidate = path.join(root, folder); try { if ((await stat(path.join(candidate, engineName))).isFile()) return candidate } catch { /* keep looking */ } }
      if ((await stat(path.join(root, engineName)).catch(() => null))?.isFile()) return root
    } catch { /* missing root */ }
  }
  return undefined
}
export function createSimulationService(options: { db: SimulationDatabase; artifactDir: string; onChanged?: () => Promise<void>; now?: () => Date; execution?: Partial<Pick<Parameters<typeof runSimulationProcess>[0], 'launch' | 'timeoutMs' | 'resultLimit'>> }) {
  let executable: Executable | null = null
  let loaded = false
  let closed = false
  let pumping = false
  let draining: Promise<void> | null = null
  const jobs: Array<{ characterId: string; id: string; profile: string; complete: boolean; executable: Executable }> = []
  const knownJobs = new Set<string>()
  const mutations = new Map<string, Promise<unknown>>()
  let active: { characterId: string; id: string; process: SimulationProcess } | undefined
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const configFile = path.join(options.artifactDir, 'engine.json')
  async function character(id: string) { const value = await options.db.call('getCharacter', id); if (!value) throw new Error('Character was not found'); return value }
  async function read(id: string) { await character(id); return simulationStoredWorkspaceSchema.parse(await options.db.call('getFeatureState', id, 'simulation') ?? {}) }
  async function mutate<T>(id: string, fn: (value: ReturnType<typeof simulationStoredWorkspaceSchema.parse>) => T | Promise<T>): Promise<T> {
    const previous = mutations.get(id) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(async () => { const state = await read(id); const result = await fn(state); await options.db.call('saveFeatureState', id, 'simulation', state); await options.onChanged?.(); return result })
    mutations.set(id, operation)
    try { return await operation } finally { if (mutations.get(id) === operation) mutations.delete(id) }
  }
  async function inspectExecutable(selected: string): Promise<Executable> {
    if (!path.isAbsolute(selected)) throw new Error('Choose an absolute SimulationCraft executable path')
    const canonical = await realpath(await commandLineEngine(selected))
    const info = await stat(canonical)
    if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error('Choose a SimulationCraft executable smaller than 256 MiB')
    if (process.platform === 'win32' && path.extname(canonical).toLowerCase() !== '.exe') throw new Error('Choose the SimulationCraft .exe file')
    return { path: canonical, name: path.basename(canonical), hash: hash(await readFile(canonical)) }
  }
  async function loadExecutable() {
    if (loaded) return
    loaded = true
    try { const value = JSON.parse(await readFile(configFile, 'utf8')) as { path?: unknown }; if (typeof value.path === 'string') executable = await inspectExecutable(value.path) } catch { executable = null }
  }
  async function updateJob(characterId: string, id: string, transform: (job: SimulationJob) => void) {
    return mutate(characterId, state => { const job = state.jobs.find(value => value.id === id); if (!job) throw new Error('The simulation job no longer exists'); transform(job); return job })
  }
  async function pump() {
    if (pumping || closed) return
    pumping = true
    try {
      while (jobs.length && !closed) {
        const queued = jobs.shift()!
        try {
          const current = await character(queued.characterId)
          const workspace = await read(queued.characterId)
          const job = workspace.jobs.find(value => value.id === queued.id)
          if (!job || job.state !== 'queued') continue
          if (characterBaselineHash(current) !== job.request.baselineHash) throw new Error('The character baseline changed before the job started')
          const selected = await inspectExecutable(queued.executable.path)
          if (selected.hash !== queued.executable.hash) throw new Error('The selected SimulationCraft executable changed — choose it again')
          if (closed) break
          await updateJob(queued.characterId, queued.id, value => { value.state = 'running'; value.startedAt = now() })
          if (closed) break
          const process = runSimulationProcess({ executable: selected.path, directory: path.join(options.artifactDir, queued.id), profile: queued.profile, request: job.request, ...options.execution })
          active = { characterId: queued.characterId, id: queued.id, process }
          const json = await process.promise
          if (closed) continue
          const latest = await character(queued.characterId)
          const result = parseSimulationReport(json, job.request, selected.hash, queued.id, now(), queued.complete)
          if (characterBaselineHash(latest) !== job.request.baselineHash) { result.applicability = 'stale'; result.reasons.push('Gear, talents, specialization, or character context changed while the simulation ran') }
          await updateJob(queued.characterId, queued.id, value => { if (value.state === 'cancelled') return; value.state = 'completed'; value.finishedAt = now(); value.result = result })
        } catch (error) {
          await updateJob(queued.characterId, queued.id, value => { if (value.state === 'cancelled') return; value.state = 'failed'; value.finishedAt = now(); value.result = null; value.failure = error instanceof Error ? error.message : 'The simulation failed' }).catch(() => {})
        } finally { active = undefined; knownJobs.delete(queued.id) }
      }
    } finally { pumping = false }
  }
  /** Current gear with the candidate's items swapped in, checked for this character and unique-equipped limits */
  function swapIn(current: Character, items: GearItem[]) {
    if (new Set(items.map(item => item.slot)).size !== items.length) throw new Error('A candidate can hold only one item per slot')
    const merged = current.gear.map(item => items.find(candidate => candidate.slot === item.slot) ?? item)
    for (const item of items) if (!merged.some(value => value.slot === item.slot)) merged.push(item)
    if (merged.length > 16) throw new Error('A gear set holds at most 16 items')
    for (const item of merged) {
      const variant = toItemVariant(item)
      const compatibility = getItemCompatibility(asCompatibilityItem(variant), current, { slot: item.slot })
      if (!compatibility.compatible) throw new Error(`${item.name}: ${compatibility.reason}`)
      if (variant.uniqueGroups.some(group => merged.filter(other => toItemVariant(other).uniqueGroups.includes(group)).length > 1)) throw new Error(`${item.name} conflicts with another unique-equipped item`)
    }
    return merged
  }
  /** Checks shared by every job: engine, activity, role, and a complete matching baseline profile */
  async function prepare(start: { characterId: string; activity: SimulationStart['activity'] }) {
    await loadExecutable()
    if (!executable) throw new Error('Choose a local SimulationCraft executable first')
    if (jobs.length >= 10) throw new Error('Wait for queued simulations to finish before adding more')
    const current = await character(start.characterId)
    if (start.activity === 'pvp') throw new Error('PvP combat simulation is not supported by this workflow')
    if (!current.specId || healerSpecs.has(current.specId)) throw new Error('This workflow supports damage modeling for known damage and tank specializations')
    const generated = exportCharacterProfile(current, now())
    if (!generated.text.startsWith('#') || !classToken(current)) throw new Error('The character baseline is unsupported')
    const workspace = await read(current.id)
    const profile = workspace.profile ?? generated
    if (!profile.matchesCurrent || profile.baselineHash !== characterBaselineHash(current)) throw new Error('The imported profile no longer matches this character — import a fresh profile')
    if (profile.coverage !== 'complete') throw new Error(`Complete the character baseline before running a local simulation — ${profile.reasons[0] ?? 'some fields are unknown'}`)
    return { current, profile, engine: executable, text: parseSimulationProfile(profile.text).text, baseline: baselineFromCharacter(current) }
  }
  async function enqueue(prepared: Awaited<ReturnType<typeof prepare>>, request: SimulationRequest, text: string, label: string) {
    const job: SimulationJob = { schemaVersion: 1, id: randomUUID(), characterId: prepared.current.id, state: 'queued', createdAt: now(), startedAt: null, finishedAt: null, request, result: null, failure: null, label }
    jobs.push({ characterId: prepared.current.id, id: job.id, profile: text, complete: prepared.profile.coverage === 'complete', executable: { ...prepared.engine } })
    knownJobs.add(job.id)
    try { await mutate(prepared.current.id, state => { state.jobs = [job, ...state.jobs].slice(0, 20) }) }
    catch (error) { const index = jobs.findIndex(value => value.id === job.id); if (index >= 0) jobs.splice(index, 1); knownJobs.delete(job.id); throw error }
    draining = pump()
    return job
  }
  function request(prepared: Awaited<ReturnType<typeof prepare>>, start: ReturnType<typeof simulationStartSchema.parse> | ReturnType<typeof simulationSwapsStartSchema.parse> | ReturnType<typeof simulationBenchmarkStartSchema.parse> | ReturnType<typeof simulationPlanStartSchema.parse>, candidates: SimulationRequest['candidates'], extra: Pick<SimulationRequest, 'mode' | 'candidateLabels'> & Partial<Pick<SimulationRequest, 'benchmark' | 'plan'>>, hashExtra: unknown = null): SimulationRequest {
    const { current, profile, engine, baseline } = prepared
    const settings = { iterations: start.iterations, threads: Math.min(start.threads, Math.max(1, availableParallelism() - 2)), timeoutMinutes: start.timeoutMinutes }
    const scenario = resolveScenario(start.scenarioId, { targets: start.targets, fightSeconds: start.fightSeconds })
    const damageTaken = tankSpecs.has(current.specId ?? 0)
    return { schemaVersion: 1, characterId: current.id, activity: start.activity, baseline, baselineHash: characterBaselineHash(current), candidates, benchmark: null, plan: null, ...extra, damageTaken, scenarioId: start.scenarioId, scenario, scenarioHash: hash({ scenarioId: start.scenarioId, scenario, settings, candidates, mode: extra.mode, damageTaken, engine: engine.hash, ...(hashExtra === null ? {} : { extra: hashExtra }) }), profileHash: profile.profileHash, options: settings, context: { now: now(), gameBuild: current.gameBuild, seasonId: null, rulesetId: null, region: current.region }, evidenceRefs: baseline.evidenceRefs }
  }
  const service = {
    get busy() { return pumping || !!active || jobs.length > 0 || mutations.size > 0 },
    async exportProfile(characterId: string) { return exportCharacterProfile(await character(characterId), now()) },
    async importProfile(characterId: string, text: string) { const profile = importCharacterProfile(await character(characterId), text, now()); await mutate(characterId, state => { state.profile = profile }); return profile },
    async clearProfile(characterId: string) { await mutate(characterId, state => { state.profile = null }); return service.list(characterId) },
    async saveReport(characterId: string, url: string, notes: string): Promise<SimulationWorkspace> {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !['www.raidbots.com', 'raidbots.com', 'www.simulationcraft.org', 'simulationcraft.org'].includes(parsed.hostname) || url.length > 2048) throw new Error('Use an HTTPS Raidbots or SimulationCraft report link')
      if (notes.length > 4000) throw new Error('Report notes must be shorter than 4000 characters')
      const baselineHash = characterBaselineHash(await character(characterId))
      await mutate(characterId, state => { state.reports = [{ id: randomUUID(), url: parsed.href, notes, createdAt: now(), baselineHash }, ...state.reports].slice(0, 40) })
      return service.list(characterId)
    },
    async list(characterId: string): Promise<SimulationWorkspace> {
      await loadExecutable()
      const current = await character(characterId)
      const baselineHash = characterBaselineHash(current)
      const workspace = await read(characterId)
      if (workspace.profile) workspace.profile.matchesCurrent = workspace.profile.baselineHash === baselineHash && workspace.profile.matchesCurrent
      for (const job of workspace.jobs) {
        if (job.result) {
          const request = { ...job.request, baselineHash, context: { ...job.request.context, gameBuild: current.gameBuild } }
          const validity = classifySimulationResult(job.result, request)
          if (executable && job.result.engine.executableHash !== executable.hash) validity.reasons.push('The selected SimulationCraft executable changed')
          job.result.applicability = validity.reasons.length ? job.result.applicability === 'unsupported' ? 'unsupported' : 'stale' : 'current'
          job.result.reasons = [...new Set(validity.reasons)]
        }
        if ((job.state === 'queued' || job.state === 'running') && !knownJobs.has(job.id)) { job.state = 'failed'; job.failure = 'The app stopped before this simulation finished'; job.finishedAt = now(); job.result = null }
      }
      return { ...workspace, configured: !!executable, executableName: executable?.name ?? null, baselineHash, limitations: ['Results model damage in the selected scenario, not player skill, healing effectiveness, or tank survival', 'External report links are bookmarks and do not establish a verified combat gain', 'Only matching engine game data and complete baseline coverage can produce a current result'] }
    },
    /** The folder the engine picker should open in */
    async engineFolder(roots: string[]) { await loadExecutable(); return engineFolder(executable?.path ?? null, roots) },
    async configureExecutable(selected: string) {
      if (closed) throw new Error('The simulation service is closing')
      const value = await inspectExecutable(selected)
      await mkdir(options.artifactDir, { recursive: true })
      const temporary = `${configFile}.tmp`
      await writeFile(temporary, JSON.stringify({ path: value.path }), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, configFile)
      executable = value; loaded = true
      return { configured: true as const, name: value.name }
    },
    async startJob(input: SimulationStart): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationStartSchema.parse(input)
      const prepared = await prepare(start)
      const { current, baseline } = prepared
      let text = prepared.text
      const candidates: SimulationRequest['candidates'] = []
      if (start.comparePlan) {
        const draft = await options.db.call('getGearDraft', { characterId: current.id, activity: start.activity, specId: current.specId })
        if (!draft?.items.length) throw new Error('Save a gear plan before comparing it')
        if (new Set(draft.items.map(item => item.slot)).size !== draft.items.length) throw new Error('The gear plan must contain one item per slot')
        const merged = swapIn(current, draft.items)
        const candidate = exportCharacterProfile(current, now(), merged)
        if (candidate.coverage !== 'complete') throw new Error(`The planned gear is incomplete — ${candidate.reasons[0]}`)
        const variants = merged.map(item => toItemVariant(item, { owned: true, observedAt: current.gearObservedAt }))
        const catalog = loadBundledProgressionRules().catalog
        const context = { now: now(), gameBuild: current.gameBuild, seasonId: null as string | null, rulesetId: null, region: current.region }
        const eligible = catalog.rulesets.filter(rule => resolveSeasonRuleset({ schemaVersion: 1, rulesets: [rule] }, { ...context, seasonId: rule.seasonId }) !== null)
        if (eligible.length !== 1) throw new Error('Planned-set simulation needs verified seasonal equipment restrictions for this game build')
        const legality = validateGearSet(variants, eligible[0]!, baseline)
        if (legality.status !== 'valid') throw new Error(`The complete planned set could not be verified — ${legality.violations[0] ?? legality.unknowns[0]}`)
        candidates.push(variants)
        text += `\ncopy=companion_candidate_1,companion_baseline\n${merged.map(item => itemLine(item).text).filter(Boolean).join('\n')}\n`
      }
      const job = request(prepared, start, candidates, { mode: 'copy', candidateLabels: start.comparePlan ? ['Planned gear'] : [] })
      return enqueue(prepared, job, text, start.comparePlan ? 'Current gear and planned gear' : 'Current gear baseline')
    },
    /** Many swaps against current gear in one engine run, each its own SimulationCraft profileset */
    async startSwaps(input: SimulationSwapsStart): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationSwapsStartSchema.parse(input)
      const prepared = await prepare(start)
      const candidates: SimulationRequest['candidates'] = []
      const lines: string[] = []
      start.candidates.forEach((candidate, index) => {
        try { swapIn(prepared.current, candidate.items) } catch (error) { throw new Error(`${candidate.label}: ${error instanceof Error ? error.message : 'this swap is not allowed'}`) }
        for (const item of candidate.items) {
          const line = itemLine(item)
          if (!line.text || line.reasons.length) throw new Error(`${candidate.label}: ${line.reasons[0] ?? 'the item could not be described to the engine'}`)
          lines.push(`profileset."companion_candidate_${index + 1}"+=${line.text}`)
        }
        candidates.push(candidate.items.map(item => toItemVariant(item)))
      })
      // Restating one equipped item changes nothing, which gives SimulationCraft a profileset for current gear
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const job = request(prepared, start, candidates, { mode: 'profileset', candidateLabels: start.candidates.map(candidate => candidate.label) })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, start.label)
    },
    /** Runs a saved gear plan as a whole and each planned upgrade on its own, so the biggest gains stand out */
    async startPlan(input: SimulationPlanStart): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationPlanStartSchema.parse(input)
      const prepared = await prepare(start)
      const activity = start.planActivity ?? start.activity
      const draft = await options.db.call('getGearDraft', { characterId: prepared.current.id, activity, specId: prepared.current.specId })
      if (!draft?.items.length) throw new Error('Save a gear plan for this activity before simulating it')
      if (new Set(draft.items.map(item => item.slot)).size !== draft.items.length) throw new Error('The gear plan must contain one item per slot')
      const { swaps, skipped } = planSwaps(prepared.current, draft.items)
      if (!swaps.length) throw new Error(skipped[0] ?? 'Your plan matches the gear you already wear')
      try { swapIn(prepared.current, swaps) } catch (error) { throw new Error(`Your plan: ${error instanceof Error ? error.message : 'this set is not allowed'}`) }
      const described = swaps.map(item => { const line = itemLine(item); if (!line.text || line.reasons.length) throw new Error(`${gearSlotLabels[item.slot]}: ${line.reasons[0] ?? 'the planned item could not be described to the engine'}`); return { item, text: line.text } })
      // The whole plan first, then each upgrade alone, all measured against the same unchanged reference
      const sets = [...(described.length > 1 ? [{ label: 'Whole plan', entries: described }] : []), ...described.map(entry => ({ label: `${gearSlotLabels[entry.item.slot]}: ${entry.item.name} at ${entry.item.itemLevel}`, entries: [entry] }))]
      const lines = sets.flatMap((set, index) => set.entries.map(entry => `profileset."companion_candidate_${index + 1}"+=${entry.text}`))
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const plan = {
        name: draft.name, activity, whole: described.length > 1 ? 0 : null, skipped,
        swaps: swaps.map(item => ({ slot: item.slot, from: prepared.current.gear.find(value => value.slot === item.slot)?.name ?? 'Empty', to: item.name, itemLevel: item.itemLevel ?? 0 })),
      }
      const job = request(prepared, start, sets.map(set => set.entries.map(entry => toItemVariant(entry.item))), { mode: 'profileset', candidateLabels: sets.map(set => set.label), plan })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, `Plan · ${draft.name}`)
    },
    /** Runs your character with the top players' most worn items and most popular talents, next to your current setup */
    async startBenchmark(input: SimulationBenchmarkStart, top: TopPlayers): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationBenchmarkStartSchema.parse(input)
      const prepared = await prepare(start)
      if (top.specId !== prepared.current.specId) throw new Error('The top players sampled are for another specialization')
      if (!top.gearPlayers) throw new Error('No top player gear was found for this specialization')
      const plan = benchmarkPlan(prepared.current, top)
      if (!plan.kinds.length) throw new Error('You already wear the items and talents most top players use')
      try { swapIn(prepared.current, plan.gear) } catch (error) { throw new Error(`${benchmarkLabels.gear}: ${error instanceof Error ? error.message : 'this swap is not allowed'}`) }
      const gearLines = plan.gear.map(item => { const line = itemLine(item); if (!line.text || line.reasons.length) throw new Error(`${benchmarkLabels.gear}: ${line.reasons[0] ?? 'an item could not be described to the engine'}`); return line.text })
      const lines: string[] = []
      plan.kinds.forEach((kind, index) => {
        const name = `companion_candidate_${index + 1}`
        if (kind !== 'talents') for (const line of gearLines) lines.push(`profileset."${name}"+=${line}`)
        if (kind !== 'gear') lines.push(`profileset."${name}"+=talents=${plan.talents}`)
      })
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const candidates = plan.kinds.map(kind => kind === 'talents' ? [] : plan.gear.map(item => toItemVariant(item)))
      const benchmark = {
        kinds: plan.kinds, population: top.population, players: top.gearPlayers,
        itemLevel: { yours: prepared.current.itemLevel, average: top.averageItemLevel },
        swapped: plan.gear.map(item => ({ slot: item.slot, from: prepared.current.gear.find(value => value.slot === item.slot)?.name ?? 'Empty', to: item.name, itemLevel: item.itemLevel ?? 0 })),
        talentPlayers: plan.talents ? top.builds[0]?.count ?? null : null, skipped: plan.skipped,
      }
      const job = request(prepared, start, candidates, { mode: 'profileset', candidateLabels: plan.kinds.map(kind => benchmarkLabels[kind]), benchmark }, { talents: plan.talents })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, 'Compared with top players')
    },
    async cancelJob(characterId: string, jobId: string) {
      const job = await updateJob(characterId, jobId, value => { if (value.state !== 'queued' && value.state !== 'running') throw new Error('Only queued or running jobs can be cancelled'); value.state = 'cancelled'; value.finishedAt = now(); value.result = null; value.failure = 'Simulation cancelled' })
      if (active?.id === jobId && active.characterId === characterId) active.process.cancel()
      const position = jobs.findIndex(value => value.id === jobId && value.characterId === characterId)
      if (position >= 0) { jobs.splice(position, 1); knownJobs.delete(jobId) }
      return job
    },
    async close() { closed = true; jobs.length = 0; active?.process.cancel(); await draining; await Promise.allSettled([...mutations.values()]) },
  }
  return service
}
export type SimulationService = ReturnType<typeof createSimulationService>
