import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { SimulationRequest, SimulationResult } from '../../shared/simulation'
import { PROFILESET_LIMIT, requestScenario, simulationResultSchema } from '../../shared/simulation'

export const RESULT_LIMIT = 100 * 1024 * 1024
// Only the last lines are kept, so this guards a runaway engine rather than memory; large profileset runs print a
// few hundred kilobytes of warnings and rankings even without progress bars
const LOG_LIMIT = 16 * 1024 * 1024
const sampleSchema = z.object({ mean: z.number().finite().nonnegative(), mean_std_dev: z.number().finite().nonnegative().optional(), count: z.number().int().positive().optional() })
// SimulationCraft's json2 report is version 2.x: each profileset carries its first metric inline and
// any others under additional_metrics. Version 3.x lists every metric under metrics; both are accepted
const profilesetMetricSchema = z.object({ metric: z.string(), mean: z.number().finite().nonnegative(), mean_stddev: z.number().finite().nonnegative().optional(), iterations: z.number().int().positive().optional() })
const profilesetSchema = z.object({ name: z.string().max(200), mean: z.number().finite().nonnegative().optional(), mean_stddev: z.number().finite().nonnegative().optional(), iterations: z.number().int().positive().optional(), additional_metrics: z.array(profilesetMetricSchema).max(4).optional(), metrics: z.array(profilesetMetricSchema).min(1).max(4).optional() })
const buildSchema = z.object({ wow_version: z.string().max(40), build_level: z.number().int().positive() })
const jsonReportSchema = z.object({
  version: z.string().min(1).max(100), report_version: z.string().regex(/^[23]\.\d+\.\d+$/), git_revision: z.string().max(100).optional(),
  // These say which data the executable was built with, not which data this run used
  ptr_enabled: z.union([z.boolean(), z.number()]).optional(), beta_enabled: z.union([z.boolean(), z.number()]).optional(),
  sim: z.object({
    options: z.object({ dbc: z.object({ version_used: z.string().max(20) }).catchall(z.unknown()).optional() }).optional(),
    players: z.array(z.object({ name: z.string(), collected_data: z.object({ dps: sampleSchema, dtps: sampleSchema.optional(), fight_length: sampleSchema.optional() }) })).min(1).max(9),
    profilesets: z.object({ metric: z.string().optional(), results: z.array(profilesetSchema).max(PROFILESET_LIMIT + 1) }).optional(),
  }),
})
const DPS = 'Damage per Second', DTPS = 'Damage Taken per Second'
const candidateName = (index: number) => `companion_candidate_${index + 1}`
/** Profileset jobs also run current gear unchanged, so the baseline is measured exactly like each candidate */
export const REFERENCE_PROFILESET = 'companion_reference'

/** Fixed engine arguments for a request; nothing here comes from profile text */
export function simulationArguments(request: SimulationRequest): string[] {
  const scenario = requestScenario(request)
  const args = ['input.simc', 'json2=result.json', 'report_details=0', 'report_progress=0', 'item_db_source=local', `iterations=${request.options.iterations}`, `threads=${request.options.threads}`, `fight_style=${scenario.style}`, `max_time=${scenario.fightSeconds}`, 'vary_combat_length=0.2']
  if (scenario.targets !== null) args.push(`desired_targets=${scenario.targets}`)
  if (request.mode === 'profileset') args.push(`profileset_metric=${request.damageTaken ? 'dps,dtps' : 'dps'}`)
  else args.push('single_actor_batch=1')
  return args
}

/** The game build of the data the run used, such as Live 12.1.5.70529 */
function engineData(dbc: Record<string, unknown> | undefined) {
  if (!dbc || typeof dbc.version_used !== 'string') return { build: null, live: false }
  const used = dbc.version_used.toLowerCase()
  const entry = Object.entries(dbc).find(([key]) => key.toLowerCase() === used)?.[1]
  const parsed = buildSchema.safeParse(entry)
  if (!parsed.success) return { build: null, live: used === 'live' }
  const { wow_version: version, build_level: level } = parsed.data
  return { build: /^\d+\.\d+\.\d+$/.test(version) ? `${version}.${level}` : version, live: used === 'live' }
}

export function parseSimulationReport(input: unknown, request: SimulationRequest, executableHash: string, artifactId: string, createdAt: string, complete: boolean): SimulationResult {
  const report = jsonReportSchema.parse(input)
  const engine = engineData(report.sim.options?.dbc)
  const candidates = request.candidates.map((_, index) => candidateName(index))
  const profileset = request.mode === 'profileset'
  const actors = profileset ? ['companion_baseline'] : ['companion_baseline', ...candidates]
  const players = report.sim.players
  if (players.length !== actors.length || new Set(players.map(player => player.name)).size !== actors.length || actors.some(name => !players.some(player => player.name === name))) throw new Error('The engine report does not contain the requested character candidates')
  const wanted = profileset ? [REFERENCE_PROFILESET, ...candidates] : []
  const results = report.sim.profilesets?.results ?? []
  const sets = new Map(results.map(set => [set.name, set.metrics ?? [...(set.mean === undefined ? [] : [{ metric: report.sim.profilesets?.metric ?? DPS, mean: set.mean, mean_stddev: set.mean_stddev, iterations: set.iterations }]), ...(set.additional_metrics ?? [])]]))
  if (profileset && (sets.size !== wanted.length || results.length !== wanted.length || wanted.some(name => !sets.has(name)))) throw new Error('The engine report does not contain the requested character candidates')
  const reasons: string[] = []
  if (!engine.build || engine.build !== request.context.gameBuild) reasons.push('The engine game data does not match the observed game build')
  if (!engine.live) reasons.push('The selected engine uses PTR or beta data')
  if (!complete) reasons.push('The simulation baseline has incomplete field coverage')
  const fromSet = (name: string, set: string) => {
    const metrics = sets.get(set)!
    const dps = metrics.find(metric => metric.metric === DPS)
    if (!dps) throw new Error('The engine report is missing damage per second for a candidate')
    const taken = request.damageTaken ? metrics.find(metric => metric.metric === DTPS) : undefined
    return { name, mean: dps.mean, standardError: dps.mean_stddev ?? null, samples: dps.iterations ?? null, damageTaken: taken ? { mean: taken.mean, standardError: taken.mean_stddev ?? null } : null }
  }
  return simulationResultSchema.parse({ schemaVersion: 1, baselineHash: request.baselineHash, profileHash: request.profileHash, scenarioHash: request.scenarioHash, gameBuild: request.context.gameBuild, rulesetId: request.context.rulesetId,
    engine: { name: 'SimulationCraft', version: report.version, reportVersion: report.report_version, revision: report.git_revision ?? null, executableHash, gameBuild: engine.build },
    metric: 'dps', unit: 'damage per second', values: profileset ? [fromSet('companion_baseline', REFERENCE_PROFILESET), ...candidates.map(name => fromSet(name, name))] : actors.map(name => {
      const data = players.find(value => value.name === name)!.collected_data
      // The player's dtps field holds total damage taken, so it is divided by the fight length
      const taken = request.damageTaken && data.dtps && data.fight_length?.mean ? { mean: data.dtps.mean / data.fight_length.mean, standardError: null } : null
      return { name, mean: data.dps.mean, standardError: data.dps.mean_std_dev ?? null, samples: data.dps.count ?? null, damageTaken: taken }
    }),
    createdAt, applicability: reasons.length ? 'unsupported' : 'current', reasons, coverage: complete ? 'complete' : 'partial', artifactId,
  })
}

export type SimulationProcess = { promise: Promise<unknown>; cancel(): void }
/** The only executable path comes from main's native picker, never from renderer profile text */
export function runSimulationProcess(options: { executable: string; directory: string; profile: string; request: SimulationRequest; timeoutMs?: number; resultLimit?: number; launch?: (executable: string, args: string[], cwd: string) => ChildProcess }): SimulationProcess {
  let child: ChildProcess | undefined
  let cancelled = false
  let cancelRunning: (() => void) | undefined
  const promise = (async () => {
    await mkdir(options.directory, { recursive: true })
    if (cancelled) throw new Error('Simulation cancelled')
    await writeFile(path.join(options.directory, 'input.simc'), options.profile, { encoding: 'utf8', flag: 'wx' })
    if (cancelled) throw new Error('Simulation cancelled')
    const args = simulationArguments(options.request)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let failure: string | undefined
      let bytes = 0
      let tail = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      let interval: ReturnType<typeof setInterval> | undefined
      const finish = (error?: Error) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); if (interval) clearInterval(interval); cancelRunning = undefined; error ? reject(error) : resolve() }
      const stop = (reason: string) => { failure ??= reason; if (child && child.exitCode === null) child.kill(); else finish(new Error(failure)) }
      cancelRunning = () => stop('Simulation cancelled')
      try {
        child = options.launch ? options.launch(options.executable, args, options.directory) : spawn(options.executable, args, { cwd: options.directory, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        child.once('error', error => finish(error))
        child.once('close', code => finish(failure || code !== 0 ? new Error(failure ?? `SimulationCraft stopped with code ${code}${tail ? ` — ${tail}` : ''}`) : undefined))
        const output = (chunk: Buffer) => { bytes += chunk.length; tail = (tail + chunk.toString('utf8')).slice(-2000); if (bytes > LOG_LIMIT) stop('Simulation output exceeded 16 MiB') }
        child.stdout?.on('data', output); child.stderr?.on('data', output)
        timer = setTimeout(() => stop('Simulation exceeded its time limit'), options.timeoutMs ?? options.request.options.timeoutMinutes * 60_000)
        interval = setInterval(() => { void stat(path.join(options.directory, 'result.json')).then(info => { if (info.size > (options.resultLimit ?? RESULT_LIMIT)) stop('Simulation report exceeded its size limit') }).catch(() => {}) }, 250)
        if (cancelled) stop('Simulation cancelled')
      } catch (error) { finish(error instanceof Error ? error : new Error('Simulation could not start')) }
    })
    if (cancelled) throw new Error('Simulation cancelled')
    const resultFile = path.join(options.directory, 'result.json')
    const canonical = await realpath(resultFile)
    const directory = await realpath(options.directory)
    if (path.dirname(canonical) !== directory) throw new Error('The simulation report is outside the managed job folder')
    const info = await stat(canonical)
    if (!info.isFile() || info.size > (options.resultLimit ?? RESULT_LIMIT)) throw new Error('Simulation report exceeded its size limit')
    return JSON.parse(await readFile(canonical, 'utf8')) as unknown
  })()
  return { promise, cancel() { cancelled = true; cancelRunning?.() } }
}
