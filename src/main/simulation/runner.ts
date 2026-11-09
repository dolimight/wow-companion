import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { SimulationRequest, SimulationResult } from '../../shared/simulation'
import { PROFILESET_LIMIT, requestScenario, simulationResultSchema } from '../../shared/simulation'

export const RESULT_LIMIT = 100 * 1024 * 1024
const LOG_LIMIT = 1024 * 1024
const sampleSchema = z.object({ mean: z.number().finite().nonnegative(), mean_std_dev: z.number().finite().nonnegative().optional(), count: z.number().int().positive().optional() })
// Report version 3 lists each profileset with one entry per requested metric
const profilesetMetricSchema = z.object({ metric: z.string(), mean: z.number().finite().nonnegative(), mean_stddev: z.number().finite().nonnegative().optional(), iterations: z.number().int().positive().optional() })
const jsonReportSchema = z.object({
  version: z.string().min(1).max(100), report_version: z.string().regex(/^3\.\d+\.\d+$/), git_revision: z.string().max(100).optional(), ptr_enabled: z.boolean().optional(), beta_enabled: z.boolean().optional(),
  sim: z.object({
    options: z.object({ dbc: z.object({ version_used: z.string(), live: z.object({ wow_version: z.string(), build_level: z.number().int().positive() }).optional() }).optional() }).optional(),
    players: z.array(z.object({ name: z.string(), collected_data: z.object({ dps: sampleSchema, dtps: sampleSchema.optional() }) })).min(1).max(9),
    profilesets: z.object({ results: z.array(z.object({ name: z.string().max(200), metrics: z.array(profilesetMetricSchema).min(1).max(4) })).max(PROFILESET_LIMIT) }).optional(),
  }),
})
const DPS = 'Damage per Second', DTPS = 'Damage Taken per Second'
const candidateName = (index: number) => `companion_candidate_${index + 1}`

/** Fixed engine arguments for a request; nothing here comes from profile text */
export function simulationArguments(request: SimulationRequest): string[] {
  const scenario = requestScenario(request)
  const args = ['input.simc', 'json2=result.json', 'report_details=0', 'item_db_source=local', `iterations=${request.options.iterations}`, `threads=${request.options.threads}`, `fight_style=${scenario.style}`, `max_time=${scenario.fightSeconds}`, 'vary_combat_length=0.2']
  if (scenario.targets !== null) args.push(`desired_targets=${scenario.targets}`)
  if (request.mode === 'profileset') args.push(`profileset_metric=${request.damageTaken ? 'dps,dtps' : 'dps'}`)
  else args.push('single_actor_batch=1')
  return args
}

export function parseSimulationReport(input: unknown, request: SimulationRequest, executableHash: string, artifactId: string, createdAt: string, complete: boolean): SimulationResult {
  const report = jsonReportSchema.parse(input)
  const dbc = report.sim.options?.dbc
  const live = dbc?.version_used === 'live' ? dbc.live : undefined
  const engineBuild = live ? (/^\d+\.\d+\.\d+$/.test(live.wow_version) ? `${live.wow_version}.${live.build_level}` : live.wow_version) : null
  const candidates = request.candidates.map((_, index) => candidateName(index))
  const actors = request.mode === 'profileset' ? ['companion_baseline'] : ['companion_baseline', ...candidates]
  const players = report.sim.players
  if (players.length !== actors.length || new Set(players.map(player => player.name)).size !== actors.length || actors.some(name => !players.some(player => player.name === name))) throw new Error('The engine report does not contain the requested character candidates')
  const sets = report.sim.profilesets?.results ?? []
  if (request.mode === 'profileset' && (sets.length !== candidates.length || new Set(sets.map(set => set.name)).size !== candidates.length || candidates.some(name => !sets.some(set => set.name === name)))) throw new Error('The engine report does not contain the requested character candidates')
  const reasons: string[] = []
  if (!engineBuild || engineBuild !== request.context.gameBuild) reasons.push('The engine game data does not match the observed game build')
  if (report.ptr_enabled || report.beta_enabled) reasons.push('The selected engine uses PTR or beta data')
  if (!complete) reasons.push('The simulation baseline has incomplete field coverage')
  return simulationResultSchema.parse({ schemaVersion: 1, baselineHash: request.baselineHash, profileHash: request.profileHash, scenarioHash: request.scenarioHash, gameBuild: request.context.gameBuild, rulesetId: request.context.rulesetId,
    engine: { name: 'SimulationCraft', version: report.version, reportVersion: report.report_version, revision: report.git_revision ?? null, executableHash, gameBuild: engineBuild },
    metric: 'dps', unit: 'damage per second', values: ['companion_baseline', ...candidates].map(name => {
      const player = players.find(value => value.name === name)
      if (player) {
        const taken = request.damageTaken ? player.collected_data.dtps : undefined
        return { name, mean: player.collected_data.dps.mean, standardError: player.collected_data.dps.mean_std_dev ?? null, samples: player.collected_data.dps.count ?? null, damageTaken: taken ? { mean: taken.mean, standardError: taken.mean_std_dev ?? null } : null }
      }
      const metrics = sets.find(value => value.name === name)!.metrics
      const dps = metrics.find(metric => metric.metric === DPS)
      if (!dps) throw new Error('The engine report is missing damage per second for a candidate')
      const taken = request.damageTaken ? metrics.find(metric => metric.metric === DTPS) : undefined
      return { name, mean: dps.mean, standardError: dps.mean_stddev ?? null, samples: dps.iterations ?? null, damageTaken: taken ? { mean: taken.mean, standardError: taken.mean_stddev ?? null } : null }
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
        const output = (chunk: Buffer) => { bytes += chunk.length; tail = (tail + chunk.toString('utf8')).slice(-2000); if (bytes > LOG_LIMIT) stop('Simulation output exceeded 1 MiB') }
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
