import { z } from 'zod'
import { activitySchema } from './domain'
import { gearBaselineSchema, itemVariantSchema } from './gear-variants'
import { evaluationContextSchema, evidenceRefSchema } from './evidence'

export const simulationScenarioSchema = z.enum(['patchwerk', 'dungeon-slice'])
export const simulationOptionsSchema = z.object({
  iterations: z.number().int().min(100).max(100_000).default(10_000),
  threads: z.number().int().min(1).max(32).default(4),
  timeoutMinutes: z.number().int().min(1).max(120).default(30),
})
export const simulationStartSchema = z.object({
  characterId: z.string().min(1).max(100), activity: activitySchema.default('mythicPlus'),
  scenarioId: simulationScenarioSchema.default('patchwerk'),
  iterations: simulationOptionsSchema.shape.iterations,
  threads: simulationOptionsSchema.shape.threads,
  timeoutMinutes: simulationOptionsSchema.shape.timeoutMinutes,
  comparePlan: z.boolean().default(false),
})
export type SimulationStart = z.input<typeof simulationStartSchema>
export const simulationProfileSchema = z.object({
  schemaVersion: z.literal(1), text: z.string().max(1_048_576),
  source: z.enum(['companion', 'manual']), createdAt: z.string().datetime(),
  baselineHash: z.string(), profileHash: z.string(),
  coverage: z.enum(['complete', 'partial']), reasons: z.array(z.string()), matchesCurrent: z.boolean(),
})
export type SimulationProfile = z.infer<typeof simulationProfileSchema>
export const simulationRequestSchema = z.object({
  schemaVersion: z.literal(1), characterId: z.string(), activity: activitySchema,
  baseline: gearBaselineSchema, baselineHash: z.string(), candidates: z.array(z.array(itemVariantSchema)).max(8),
  scenarioId: simulationScenarioSchema, scenarioHash: z.string(), profileHash: z.string(),
  options: simulationOptionsSchema, context: evaluationContextSchema,
  evidenceRefs: z.array(evidenceRefSchema),
})
export type SimulationRequest = z.infer<typeof simulationRequestSchema>
export const simulationResultSchema = z.object({
  schemaVersion: z.literal(1), baselineHash: z.string(), profileHash: z.string(), scenarioHash: z.string(),
  gameBuild: z.string().nullable(), rulesetId: z.string().nullable(),
  engine: z.object({ name: z.literal('SimulationCraft'), version: z.string(), revision: z.string().nullable(), executableHash: z.string(), reportVersion: z.string(), gameBuild: z.string().nullable() }),
  metric: z.literal('dps'), unit: z.literal('damage per second'),
  values: z.array(z.object({ name: z.string(), mean: z.number().finite().nonnegative(), standardError: z.number().finite().nonnegative().nullable(), samples: z.number().int().positive().nullable() })).min(1).max(9),
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

/** Compare two modeled damage results using each engine-reported standard error */
export function compareSimulationValues(baseline: SimulationResult['values'][number], candidate: SimulationResult['values'][number]): { verdict: 'higher' | 'lower' | 'sidegrade' | 'unknown'; difference: number; uncertainty: number | null } {
  const difference = candidate.mean - baseline.mean
  if (baseline.standardError === null || candidate.standardError === null) return { verdict: 'unknown', difference, uncertainty: null }
  const uncertainty = 1.96 * Math.hypot(baseline.standardError, candidate.standardError)
  return { verdict: Math.abs(difference) <= uncertainty ? 'sidegrade' : difference > 0 ? 'higher' : 'lower', difference, uncertainty }
}
