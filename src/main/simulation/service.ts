import { availableParallelism } from 'node:os'
import path from 'node:path'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Character } from '../../shared/domain'
import type { DatabaseClient } from '../database'
import { baselineFromCharacter, toItemVariant } from '../../shared/gear-variants'
import { getItemCompatibility } from '../../shared/item-compatibility'
import { asCompatibilityItem } from '../../shared/gear-set-validation'
import { validateGearSet } from '../../shared/gear-set-validation'
import { resolveSeasonRuleset } from '../../shared/season-rules'
import { loadBundledProgressionRules } from '../progression/service'
import { classifySimulationResult, simulationStartSchema, simulationStoredWorkspaceSchema, type SimulationJob, type SimulationRequest, type SimulationWorkspace, type SimulationStart } from '../../shared/simulation'
import { characterBaselineHash, classToken, exportCharacterProfile, hash, healerSpecs, importCharacterProfile, itemLine, parseSimulationProfile } from './profiles'
import { parseSimulationReport, runSimulationProcess, type SimulationProcess } from './runner'

type SimulationDatabase = Pick<DatabaseClient, 'call'>
type Executable = { path: string; name: string; hash: string }
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
    const canonical = await realpath(selected)
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
      let text = parseSimulationProfile(profile.text).text
      const baseline = baselineFromCharacter(current)
      const candidates: SimulationRequest['candidates'] = []
      if (start.comparePlan) {
        const draft = await options.db.call('getGearDraft', { characterId: current.id, activity: start.activity, specId: current.specId })
        if (!draft?.items.length) throw new Error('Save a gear plan before comparing it')
        const merged = current.gear.map(item => draft.items.find(candidate => candidate.slot === item.slot) ?? item)
        for (const item of draft.items) if (!merged.some(value => value.slot === item.slot)) merged.push(item)
        if (merged.length > 16 || new Set(merged.map(item => item.slot)).size !== merged.length) throw new Error('The gear plan must contain one item per slot')
        for (const item of merged) {
          const variant = toItemVariant(item)
          const compatibility = getItemCompatibility(asCompatibilityItem(variant), current, { slot: item.slot })
          if (!compatibility.compatible) throw new Error(`${item.name}: ${compatibility.reason}`)
          if (variant.uniqueGroups.some(group => merged.filter(other => toItemVariant(other).uniqueGroups.includes(group)).length > 1)) throw new Error('The gear plan contains conflicting unique-equipped items')
        }
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
      const settings = { iterations: start.iterations, threads: Math.min(start.threads, Math.max(1, availableParallelism() - 2)), timeoutMinutes: start.timeoutMinutes }
      const request: SimulationRequest = { schemaVersion: 1, characterId: current.id, activity: start.activity, baseline, baselineHash: characterBaselineHash(current), candidates, scenarioId: start.scenarioId, scenarioHash: hash({ scenarioId: start.scenarioId, settings, candidates, engine: executable.hash }), profileHash: profile.profileHash, options: settings, context: { now: now(), gameBuild: current.gameBuild, seasonId: null, rulesetId: null, region: current.region }, evidenceRefs: baseline.evidenceRefs }
      const job: SimulationJob = { schemaVersion: 1, id: randomUUID(), characterId: current.id, state: 'queued', createdAt: now(), startedAt: null, finishedAt: null, request, result: null, failure: null, label: start.comparePlan ? 'Current gear and planned gear' : 'Current gear baseline' }
      jobs.push({ characterId: current.id, id: job.id, profile: text, complete: profile.coverage === 'complete', executable: { ...executable } })
      knownJobs.add(job.id)
      try { await mutate(current.id, state => { state.jobs = [job, ...state.jobs].slice(0, 20) }) }
      catch (error) { const index = jobs.findIndex(value => value.id === job.id); if (index >= 0) jobs.splice(index, 1); knownJobs.delete(job.id); throw error }
      draining = pump()
      return job
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
