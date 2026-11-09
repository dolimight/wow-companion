import type { TopPlayers } from '../../shared/top-players'
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
  return { schemaVersion: 1, characterId: character.id, activity: 'mythicPlus', baseline: baselineFromCharacter(character), baselineHash: characterBaselineHash(character), candidates: [], mode: 'copy', candidateLabels: [], damageTaken: false, benchmark: null, plan: null, scenarioId: 'patchwerk', scenario: null, scenarioHash: hash('fixture-patchwerk'), profileHash: profile.profileHash, options: { iterations: 100, threads: 1, timeoutMinutes: 1 }, context: { now: '2026-10-29T12:00:00.000Z', gameBuild: character.gameBuild, seasonId: null, rulesetId: null }, evidenceRefs: [] }
}
/** A json2 profileset report: the unchanged reference first, then each named candidate, with damage taken */
export function profilesetJson(names: string[], means: number[]) {
  const report = simulationJson() as ReturnType<typeof simulationJson> & { sim: { profilesets?: unknown } }
  const entry = (name: string, mean: number, taken: number) => ({ name, mean, min: 0, max: 0, stddev: 1, mean_stddev: 110, mean_error: 215, iterations: 1000, additional_metrics: [{ metric: 'Damage Taken per Second', mean: taken, min: 0, max: 0, stddev: 1, mean_stddev: 80, mean_error: 157 }] })
  report.sim.profilesets = { metric: 'Damage per Second', results: [entry('companion_reference', 100_200, 40_000), ...names.map((name, index) => entry(name, means[index]!, 39_000))] }
  return report
}
/** Shaped like a real SimulationCraft json2 report (version 2.0.0), as fixtures/simulation records */
export function simulationJson() { return { version: '1210-01', report_version: '2.0.0', ptr_enabled: 1, beta_enabled: 0, git_revision: 'fixture', sim: { options: { dbc: { Live: { build_level: 70575, wow_version: '12.1.5.70575' }, PTR: { build_level: 70424, wow_version: '12.1.7.70424' }, version_used: 'Live' } as Record<string, unknown> }, players: [{ name: 'companion_baseline', collected_data: { fight_length: { mean: 300, count: 1000 }, dps: { mean: 100_000, mean_std_dev: 120, count: 1000 }, dtps: { mean: 12_000_000, count: 1000 } } as Record<string, { mean: number; mean_std_dev?: number; count: number }> }] } } }
/** A small top-player tally for one Blood Death Knight sample */
export function topFixture(patch: Partial<TopPlayers> = {}): TopPlayers {
  return {
    season: { slug: 'fixture', name: 'Fixture season' }, specId: 250, specName: 'Blood', className: 'Death Knight', region: 'us',
    observedAt: '2026-10-29T12:00:00.000Z', runsScanned: 100, source: 'Raider.IO spec rankings', population: 'Top 10 Blood Death Knight players by Mythic+ score',
    players: [], gearPlayers: 10, averageItemLevel: 110,
    builds: [{ loadout: 'TOPBUILD123', count: 6, players: [] }],
    slots: {
      head: { items: [{ id: 2000, name: 'Top helm', count: 8, level: 112 }], enchants: [], gems: [] },
      neck: { items: [{ id: 1001, name: 'Your neck', count: 7, level: 100 }], enchants: [], gems: [] },
      rings: { items: [{ id: 2010, name: 'Top ring', count: 9, level: 111 }, { id: 1011, name: 'Your second ring', count: 5, level: 100 }], enchants: [], gems: [] },
      trinkets: { items: [{ id: 2012, name: 'Top trinket', count: 9, level: null }], enchants: [], gems: [] },
    },
    ...patch,
  }
}
