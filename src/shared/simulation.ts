import { z } from 'zod'
import { activitySchema, gearItemSchema, planIdSchema } from './domain'
import { gearBaselineSchema, itemVariantSchema } from './gear-variants'
import { evaluationContextSchema, evidenceRefSchema } from './evidence'

export const simulationScenarioSchema = z.enum(['patchwerk', 'cleave', 'big-pulls', 'dungeon-slice'])
export type SimulationScenarioId = z.infer<typeof simulationScenarioSchema>
/** SimulationCraft fight styles the app passes through; anything else is rejected */
export const fightStyles = ['Patchwerk', 'DungeonSlice', 'HecticAddCleave'] as const
export const scenarioSettingsSchema = z.object({
  style: z.enum(fightStyles),
  /** Enemy count for styles that use one; DungeonSlice sets its own pulls */
  targets: z.number().int().min(1).max(10).nullable(),
  fightSeconds: z.number().int().min(30).max(900),
})
export type ScenarioSettings = z.infer<typeof scenarioSettingsSchema>
/** Presets in plain words, each a fixed SimulationCraft fight setup */
export const simulationScenarios: Record<SimulationScenarioId, ScenarioSettings & { label: string; description: string }> = {
  patchwerk: { label: 'Raid boss', description: 'One target for five minutes', style: 'Patchwerk', targets: 1, fightSeconds: 300 },
  cleave: { label: 'Two-target boss', description: 'Two targets for five minutes', style: 'Patchwerk', targets: 2, fightSeconds: 300 },
  'big-pulls': { label: 'Mythic+ big pulls', description: 'Five targets that die within a minute', style: 'Patchwerk', targets: 5, fightSeconds: 60 },
  'dungeon-slice': { label: 'Mythic+ mixed pulls', description: "SimulationCraft's dungeon mix of packs and bosses", style: 'DungeonSlice', targets: null, fightSeconds: 300 },
}
/** A preset with any custom target count or fight length applied */
export function resolveScenario(id: SimulationScenarioId, custom?: Partial<Pick<ScenarioSettings, 'targets' | 'fightSeconds'>> | null): ScenarioSettings {
  const preset = simulationScenarios[id]
  return scenarioSettingsSchema.parse({ style: preset.style, targets: preset.style === 'DungeonSlice' ? null : custom?.targets ?? preset.targets, fightSeconds: custom?.fightSeconds ?? preset.fightSeconds })
}
/** Profileset jobs test this many candidates against one baseline in a single engine run */
export const PROFILESET_LIMIT = 400
export const simulationOptionsSchema = z.object({
  iterations: z.number().int().min(100).max(100_000).default(10_000),
  threads: z.number().int().min(1).max(32).default(4),
  timeoutMinutes: z.number().int().min(1).max(120).default(30),
})
export const simulationStartSchema = z.object({
  characterId: z.string().min(1).max(100), activity: activitySchema.default('mythicPlus'),
  scenarioId: simulationScenarioSchema.default('patchwerk'),
  targets: z.number().int().min(1).max(10).optional(),
  fightSeconds: z.number().int().min(30).max(900).optional(),
  iterations: simulationOptionsSchema.shape.iterations,
  threads: simulationOptionsSchema.shape.threads,
  timeoutMinutes: simulationOptionsSchema.shape.timeoutMinutes,
  comparePlan: z.boolean().default(false),
})
export type SimulationStart = z.input<typeof simulationStartSchema>
/** Single swaps or small sets to test against current gear in one profileset run */
export const simulationSwapsStartSchema = simulationStartSchema.omit({ comparePlan: true }).extend({
  candidates: z.array(z.object({ label: z.string().min(1).max(200), items: z.array(gearItemSchema).min(1).max(16) })).min(1).max(PROFILESET_LIMIT),
  label: z.string().min(1).max(200).default('Gear swaps'),
})
export type SimulationSwapsStart = z.input<typeof simulationSwapsStartSchema>
/** Your character run with the sampled top players' items and talents, as a reference point for your own number */
export const simulationBenchmarkStartSchema = simulationStartSchema.omit({ comparePlan: true })
export type SimulationBenchmarkStart = z.input<typeof simulationBenchmarkStartSchema>
export const simulationBenchmarkSchema = z.object({
  kinds: z.array(z.enum(['gear', 'talents', 'both'])).max(3),
  population: z.string().max(400), players: z.number().int().nonnegative(),
  itemLevel: z.object({ yours: z.number().nullable(), average: z.number().nullable() }),
  swapped: z.array(z.object({ slot: z.string().max(20), from: z.string().max(200), to: z.string().max(200), itemLevel: z.number() })).max(16),
  talentPlayers: z.number().int().nonnegative().nullable(),
  skipped: z.array(z.string().max(200)).max(20),
  /** The item level top players' gear was capped at, the top of the regular upgrade ranks; absent on older runs */
  cap: z.number().nullable().default(null),
})
export type SimulationBenchmark = z.infer<typeof simulationBenchmarkSchema>
/** A saved gear plan run as a whole and one planned upgrade at a time */
export const simulationPlanStartSchema = simulationStartSchema.omit({ comparePlan: true }).extend({ planActivity: activitySchema.optional(), plan: planIdSchema.optional() })
export type SimulationPlanStart = z.input<typeof simulationPlanStartSchema>
export const simulationPlanSchema = z.object({
  name: z.string().max(100), activity: activitySchema,
  /** Index into the request candidates of the whole plan, or null when the plan changes a single slot */
  whole: z.number().int().nonnegative().nullable(),
  swaps: z.array(z.object({ slot: z.string().max(20), from: z.string().max(200), to: z.string().max(200), itemLevel: z.number() })).max(16),
  skipped: z.array(z.string().max(200)).max(40),
  /** The top players' most worn items run in the same job, so the plan can be read against them */
  top: z.object({
    /** Index into the request candidates of the top players' gear */
    index: z.number().int().nonnegative(),
    population: z.string().max(400), players: z.number().int().nonnegative(),
    /** Slots where the plan does not reach what top players wear */
    differences: z.array(z.object({ slot: z.string().max(20), plan: z.string().max(200), top: z.string().max(200), itemLevel: z.number() })).max(16),
    /** The item level top players' gear was capped at, the top of the regular upgrade ranks; absent on older runs */
    cap: z.number().nullable().default(null),
    /** True when the plan reached past the top regular upgrade rank, so their items ran uncapped */
    beyondCap: z.boolean().default(false),
    /** Each top-player item run on its own, so a slot can be read as your planned item against theirs */
    singles: z.array(z.object({ slot: z.string().max(20), index: z.number().int().nonnegative() })).max(16).default([]),
  }).nullable().default(null),
  /** The plan's own talent build when it differs from yours, run with the whole plan */
  talents: z.string().max(400).nullable().default(null),
  /**
   * Each sampled top player run as they play, their gear and talents on your character, so the plan can be ranked
   * among them one by one. Replaces `top` on newer runs
   */
  roster: z.object({
    population: z.string().max(400),
    cap: z.number().nullable(),
    beyondCap: z.boolean(),
    players: z.array(z.object({
      name: z.string().max(100), realm: z.string().max(100), url: z.string().max(400), score: z.number().nullable(),
      /** Their talent build, when it was known and ran with their gear */
      loadout: z.string().max(400).nullable(),
      /** Index into the request candidates of their whole setup */
      index: z.number().int().nonnegative(),
      /** Each of their items alone; null means it is exactly what you wear now */
      singles: z.array(z.object({ slot: z.string().max(20), index: z.number().int().nonnegative().nullable() })).max(16),
    })).max(20),
  }).nullable().default(null),
})
export type SimulationPlan = z.infer<typeof simulationPlanSchema>
export const simulationProfileSchema = z.object({
  schemaVersion: z.literal(1), text: z.string().max(1_048_576),
  source: z.enum(['companion', 'manual']), createdAt: z.string().datetime(),
  baselineHash: z.string(), profileHash: z.string(),
  coverage: z.enum(['complete', 'partial']), reasons: z.array(z.string()), matchesCurrent: z.boolean(),
})
export type SimulationProfile = z.infer<typeof simulationProfileSchema>
export const simulationRequestSchema = z.object({
  schemaVersion: z.literal(1), characterId: z.string(), activity: activitySchema,
  baseline: gearBaselineSchema, baselineHash: z.string(), candidates: z.array(z.array(itemVariantSchema)).max(PROFILESET_LIMIT),
  /** copy runs every candidate as its own actor (up to 8); profileset runs many against one baseline */
  mode: z.enum(['copy', 'profileset']).default('copy'),
  candidateLabels: z.array(z.string().max(200)).max(PROFILESET_LIMIT).default([]),
  /** Tanks also record damage taken per second as a modeled survivability measure */
  damageTaken: z.boolean().default(false),
  benchmark: simulationBenchmarkSchema.nullable().default(null),
  plan: simulationPlanSchema.nullable().default(null),
  scenarioId: simulationScenarioSchema, scenario: scenarioSettingsSchema.nullable().default(null), scenarioHash: z.string(), profileHash: z.string(),
  options: simulationOptionsSchema, context: evaluationContextSchema,
  evidenceRefs: z.array(evidenceRefSchema),
})
export type SimulationRequest = z.infer<typeof simulationRequestSchema>
export const simulationResultSchema = z.object({
  schemaVersion: z.literal(1), baselineHash: z.string(), profileHash: z.string(), scenarioHash: z.string(),
  gameBuild: z.string().nullable(), rulesetId: z.string().nullable(),
  engine: z.object({ name: z.literal('SimulationCraft'), version: z.string(), revision: z.string().nullable(), executableHash: z.string(), reportVersion: z.string(), gameBuild: z.string().nullable() }),
  metric: z.literal('dps'), unit: z.literal('damage per second'),
  values: z.array(z.object({ name: z.string(), mean: z.number().finite().nonnegative(), standardError: z.number().finite().nonnegative().nullable(), samples: z.number().int().positive().nullable(),
    damageTaken: z.object({ mean: z.number().finite().nonnegative(), standardError: z.number().finite().nonnegative().nullable() }).nullable().default(null) })).min(1).max(PROFILESET_LIMIT + 1),
  createdAt: z.string().datetime(), applicability: z.enum(['current', 'stale', 'unsupported']), reasons: z.array(z.string()),
  coverage: z.enum(['complete', 'partial']), artifactId: z.string(),
})
export type SimulationResult = z.infer<typeof simulationResultSchema>
export const simulationJobSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), characterId: z.string(),
  state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  createdAt: z.string().datetime(), startedAt: z.string().datetime().nullable(), finishedAt: z.string().datetime().nullable(),
  request: simulationRequestSchema, result: simulationResultSchema.nullable(), failure: z.string().nullable(),
  label: z.string(),
})
export type SimulationJob = z.infer<typeof simulationJobSchema>
export const simulationReportSchema = z.object({ id: z.string(), url: z.string().url().max(2048), notes: z.string().max(4000), createdAt: z.string().datetime(), baselineHash: z.string() })
export const simulationStoredWorkspaceSchema = z.object({ schemaVersion: z.literal(1).default(1), profile: simulationProfileSchema.nullable().default(null), reports: z.array(simulationReportSchema).max(40).default([]), jobs: z.array(simulationJobSchema).max(20).default([]) })
export type SimulationStoredWorkspace = z.infer<typeof simulationStoredWorkspaceSchema>
export type SimulationWorkspace = SimulationStoredWorkspace & { configured: boolean; executableName: string | null; baselineHash: string; limitations: string[] }

export function classifySimulationResult(result: SimulationResult, current: SimulationRequest): { applicable: boolean; reasons: string[] } {
  const reasons = [...result.reasons]
  if (result.baselineHash !== current.baselineHash) reasons.push('Gear, talents, specialization, or character context changed')
  if (result.profileHash !== current.profileHash) reasons.push('The simulation profile changed')
  if (result.scenarioHash !== current.scenarioHash) reasons.push('The scenario or engine options changed')
  if (result.gameBuild !== current.context.gameBuild || result.rulesetId !== current.context.rulesetId) reasons.push('The game build or seasonal rules changed')
  if (result.engine.gameBuild === null || result.engine.gameBuild !== current.context.gameBuild) reasons.push('The engine game data does not match the observed game build')
  if (result.coverage !== 'complete') reasons.push('The simulation baseline has incomplete field coverage')
  return { applicable: reasons.length === 0, reasons: [...new Set(reasons)] }
}

export function requestScenario(request: Pick<SimulationRequest, 'scenarioId' | 'scenario'>): ScenarioSettings {
  return request.scenario ?? resolveScenario(request.scenarioId)
}

/** Compare two modeled damage results using each engine-reported standard error */
type Measured = Pick<SimulationResult['values'][number], 'mean' | 'standardError'>
export function compareSimulationValues(baseline: Measured, candidate: Measured): { verdict: 'higher' | 'lower' | 'sidegrade' | 'unknown'; difference: number; uncertainty: number | null } {
  const difference = candidate.mean - baseline.mean
  if (baseline.standardError === null || candidate.standardError === null) return { verdict: 'unknown', difference, uncertainty: null }
  const uncertainty = 1.96 * Math.hypot(baseline.standardError, candidate.standardError)
  return { verdict: Math.abs(difference) <= uncertainty ? 'sidegrade' : difference > 0 ? 'higher' : 'lower', difference, uncertainty }
}
