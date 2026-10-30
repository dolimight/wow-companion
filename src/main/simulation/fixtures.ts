import { characterSchema, gearItemSchema } from '../../shared/domain'
import { baselineFromCharacter } from '../../shared/gear-variants'
import type { SimulationRequest } from '../../shared/simulation'
import { progressionInput } from '../../../fixtures/progression'
import { characterBaselineHash, exportCharacterProfile, hash } from './profiles'

/** Synthetic data only — this does not validate the installed game or a real SimC engine */
export function simulationCharacter() {
  const input = progressionInput()
  return characterSchema.parse({ id: 'simulation-fixture', name: 'Synthetic', region: 'us', realm: 'Fixture', className: 'Death Knight', raceName: 'Blood Elf', specName: 'Blood', specId: 250, level: 90, gameBuild: '12.1.5.70575', gearObservedAt: '2026-10-29T12:00:00.000Z', gearCoverage: 'complete', talents: { loadout: 'ABC123/def+XYZ==', specId: 250, source: 'addon', observedAt: '2026-10-29T12:00:00.000Z' }, gear: input.baseline.items.map(item => gearItemSchema.parse({ ...item, classId: item.classId ?? undefined, subclassId: item.subclassId ?? undefined, enchantId: 0, gemIds: [], bonusIds: [], variantCoverage: 'complete' })) })
}
export function simulationRequest(): SimulationRequest {
  const character = simulationCharacter()
  const profile = exportCharacterProfile(character)
  return { schemaVersion: 1, characterId: character.id, activity: 'mythicPlus', baseline: baselineFromCharacter(character), baselineHash: characterBaselineHash(character), candidates: [], scenarioId: 'patchwerk', scenarioHash: hash('fixture-patchwerk'), profileHash: profile.profileHash, options: { iterations: 100, threads: 1, timeoutMinutes: 1 }, context: { now: '2026-10-29T12:00:00.000Z', gameBuild: character.gameBuild, seasonId: null, rulesetId: null }, evidenceRefs: [] }
}
export function simulationJson() { return { version: '120105-01', report_version: '3.0.0', git_revision: 'fixture', sim: { options: { dbc: { version_used: 'live', live: { wow_version: '12.1.5', build_level: 70575 } } }, players: [{ name: 'companion_baseline', collected_data: { dps: { mean: 100_000, mean_std_dev: 120, count: 1000 } } }] } } }
