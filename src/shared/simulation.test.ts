import { describe, expect, it } from 'vite-plus/test'
import { classifySimulationResult, compareSimulationValues } from './simulation'
import { simulationJson, simulationRequest } from '../main/simulation/fixtures'
import { parseSimulationReport } from '../main/simulation/runner'

describe('simulation applicability and uncertainty', () => {
  it('keeps changes in context and unknown engine compatibility out of current recommendations', () => {
    const request = simulationRequest()
    const result = parseSimulationReport(simulationJson(), request, 'engine-sha256', 'fixture', request.context.now, true)
    expect(classifySimulationResult(result, request)).toEqual({ applicable: true, reasons: [] })
    for (const patch of [{ baselineHash: 'changed' }, { profileHash: 'changed' }, { scenarioHash: 'changed' }, { context: { ...request.context, rulesetId: 'new' } }]) expect(classifySimulationResult(result, { ...request, ...patch }).applicable).toBe(false)
    result.engine.gameBuild = null
    expect(classifySimulationResult(result, request).applicable).toBe(false)
  })
  it('labels overlapping error intervals as sidegrades rather than inventing a universal threshold', () => {
    const baseline = { name: 'current', mean: 100_000, standardError: 100, samples: 1000 }
    expect(compareSimulationValues(baseline, { ...baseline, mean: 100_100 }).verdict).toBe('sidegrade')
    expect(compareSimulationValues(baseline, { ...baseline, mean: 101_000 }).verdict).toBe('higher')
    expect(compareSimulationValues(baseline, { ...baseline, mean: 99_000 }).verdict).toBe('lower')
    expect(compareSimulationValues(baseline, { ...baseline, standardError: null }).verdict).toBe('unknown')
  })
})
