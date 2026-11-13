import { afterEach, describe, expect, it } from 'vite-plus/test'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseRepository } from '../../workers/database/repository'
import type { DatabaseClient } from '../database'
import { createSimulationService, engineFolder } from './service'
import { exportCharacterProfile } from './profiles'
import { profilesetJson, simulationCharacter, simulationJson, topFixture } from './fixtures'


const databases: DatabaseRepository[] = []
const directories: string[] = []
const services: ReturnType<typeof createSimulationService>[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const db of databases.splice(0)) db.close(); for (const directory of directories.splice(0)) { if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'wow-simulation-service-'))) throw new Error('Unexpected test directory'); await rm(directory, { recursive: true, force: true }) } })
async function fixture(body?: string, extra: Partial<Parameters<typeof createSimulationService>[0]> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'wow-simulation-service-')); directories.push(root)
  const database = new DatabaseRepository(':memory:'); databases.push(database)
  const character = database.addCharacter(simulationCharacter())
  const bridge = { call: async (method: keyof DatabaseRepository, ...args: unknown[]) => (database[method] as (...args: unknown[]) => unknown).apply(database, args) } as Pick<DatabaseClient, 'call'>
  const file = path.join(root, 'engine-fixture.mjs')
  await writeFile(file, `import fs from 'node:fs/promises'; ${body ?? `await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(simulationJson())}));`}`)
  const service = createSimulationService({ db: bridge, artifactDir: path.join(root, 'artifacts'), ...extra, execution: { launch: (_executable, args, cwd) => spawn(process.execPath, [file, ...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) } }); services.push(service)
  return { database, character, service, bridge, root }
}
async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> { const deadline = Date.now() + 4000; let value = await read(); while (!predicate(value)) { if (Date.now() > deadline) throw new Error('Fixture job did not settle'); await new Promise(resolve => setTimeout(resolve, 20)); value = await read() } return value }
describe('simulation workspace and job lifecycle', () => {
  it('exports and stores profiles/reports without needing an executable, isolating character state', async () => {
    const { database, character, service } = await fixture()
    const other = database.addCharacter({ name: 'Other', realm: 'Fixture', region: 'us' })
    const profile = await service.exportProfile(character.id)
    await service.importProfile(character.id, profile.text)
    await service.saveReport(character.id, 'https://www.raidbots.com/simbot/report/fixture', 'Synthetic bookmark')
    expect((await service.list(character.id)).reports).toHaveLength(1)
    expect((await service.list(other.id)).reports).toHaveLength(0)
    expect((await service.list(character.id)).configured).toBe(false)
    await expect(service.saveReport(character.id, 'https://www.raidbots.com.evil.example/report', '')).rejects.toThrow('HTTPS')
    await expect(service.saveReport(character.id, 'https://name:password@www.raidbots.com/report', '')).rejects.toThrow('HTTPS')
    await service.clearProfile(character.id)
    expect((await service.list(character.id)).profile).toBeNull()
  })
  it('runs a synthetic engine fixture and stores immutable provenance, then invalidates changed gear', async () => {
    const { database, character, service } = await fixture()
    await service.configureExecutable(process.execPath)
    const queued = await service.startJob({ characterId: character.id, activity: 'mythicPlus', scenarioId: 'patchwerk', iterations: 100 })
    expect(queued.state).toBe('queued')
    const done = await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    expect(done.jobs[0]).toMatchObject({ state: 'completed', result: { applicability: 'current', metric: 'dps', values: [{ name: 'companion_baseline', mean: 100000, standardError: 120 }] } })
    const frozen = done.jobs[0]!.result!.baselineHash
    const backup = database.exportBackup()
    database.importBackup({ ...backup, characters: backup.characters.map(value => value.id === character.id ? { ...value, gear: value.gear.map((item, index) => index ? item : { ...item, bonusIds: [999] }) } : value) })
    const changed = await service.list(character.id)
    expect(changed.jobs[0]!.result!.applicability).toBe('stale')
    expect(changed.jobs[0]!.result!.baselineHash).toBe(frozen)
  })
  it('cancels active work and prevents partial output from becoming a completed result', async () => {
    const { character, service } = await fixture('setInterval(()=>{},1000);')
    await service.configureExecutable(process.execPath)
    const job = await service.startJob({ characterId: character.id })
    await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'running')
    await service.cancelJob(character.id, job.id)
    expect((await service.list(character.id)).jobs[0]).toMatchObject({ state: 'cancelled', result: null })
  })
  it('rejects incomplete observations, unsupported PvP/healer scenarios and stale imported profiles', async () => {
    const { database, character, service } = await fixture()
    await service.configureExecutable(process.execPath)
    await expect(service.startJob({ characterId: character.id, activity: 'pvp' })).rejects.toThrow('PvP')
    await service.importProfile(character.id, exportCharacterProfile(character).text.replace('talents=ABC123/def+XYZ==', 'talents=OTHER'))
    await expect(service.startJob({ characterId: character.id })).rejects.toThrow('no longer matches')
    await service.clearProfile(character.id)
    const partial = database.addCharacter({ name: 'Partial', region: 'us', realm: 'Fixture', className: 'Mage', specId: 62 })
    await expect(service.startJob({ characterId: partial.id })).rejects.toThrow('Complete the character baseline')
    const healer = database.addCharacter({ name: 'Healer', region: 'us', realm: 'Fixture', className: 'Priest', specId: 257 })
    await expect(service.startJob({ characterId: healer.id })).rejects.toThrow('damage modeling')
  })
  it('runs many swaps as profilesets and keeps each candidate label with its result', async () => {
    const { character, service, root } = await fixture(`await fs.writeFile('args.json',JSON.stringify(process.argv.slice(2)));await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2'], [103_000, 99_500]))}));`)
    await service.configureExecutable(process.execPath)
    const [first, second] = character.gear
    const candidates = [{ label: `${first!.name} at ${first!.itemLevel! + 13}`, items: [{ ...first!, itemLevel: first!.itemLevel! + 13 }] }, { label: `${second!.name} at ${second!.itemLevel! + 6}`, items: [{ ...second!, itemLevel: second!.itemLevel! + 6 }] }]
    await service.startSwaps({ characterId: character.id, scenarioId: 'big-pulls', candidates, iterations: 100 })
    const done = await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    expect(done.jobs[0]).toMatchObject({ state: 'completed', label: 'Gear swaps', request: { mode: 'profileset', damageTaken: true, candidateLabels: candidates.map(candidate => candidate.label), scenario: { style: 'Patchwerk', targets: 5, fightSeconds: 60 } } })
    expect(done.jobs[0]!.result!.values.map(value => value.mean)).toEqual([100_200, 103_000, 99_500])
    const input = await readFile(path.join(root, 'artifacts', done.jobs[0]!.id, 'input.simc'), 'utf8')
    expect(input).toMatch(/^profileset\."companion_reference"\+=\w+=,id=/m)
    expect(input.match(/^profileset\."companion_candidate_\d"\+=/gm)).toHaveLength(2)
  })
  it('refuses a swap the character cannot wear or that breaks unique-equipped limits', async () => {
    const { character, service } = await fixture()
    await service.configureExecutable(process.execPath)
    const head = character.gear.find(item => item.slot === 'head')!
    await expect(service.startSwaps({ characterId: character.id, candidates: [{ label: 'Cloth hat', items: [{ ...head, classId: 4, subclassId: 1 }] }] })).rejects.toThrow('Cloth hat')
    await expect(service.startSwaps({ characterId: character.id, candidates: [{ label: 'Two heads', items: [head, head] }] })).rejects.toThrow('one item per slot')
    await expect(service.startSwaps({ characterId: character.id, candidates: [{ label: 'Unknown bonuses', items: [{ ...head, bonusIds: null, itemLink: null }] }] })).rejects.toThrow('Unknown bonuses')
  })
  it('never recreates a deleted character after a queued or active result arrives', async () => {
    const { database, character, service } = await fixture(`await new Promise(resolve=>setTimeout(resolve,100));await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(simulationJson())}));`)
    await service.configureExecutable(process.execPath)
    await service.startJob({ characterId: character.id })
    await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'running')
    database.deleteCharacter(character.id)
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(database.getCharacter(character.id)).toBeNull()
    await expect(service.list(character.id)).rejects.toThrow('not found')
    expect(database.exportBackup().featureStates.some(value => value.characterId === character.id)).toBe(false)
  })
})
describe('choosing the engine', () => {
  const windows = process.platform === 'win32'
  const engine = windows ? 'simc.exe' : 'simc'
  const app = windows ? 'SimulationCraft.exe' : 'SimulationCraft'
  it('opens the picker in the configured folder, else the newest installed SimulationCraft folder', async () => {
    const { root } = await fixture()
    const programs = path.join(root, 'Programs')
    for (const folder of ['simc-1205.01-win64', 'simc-1210.01-win64', 'simc-1299.01-empty']) await mkdir(path.join(programs, folder), { recursive: true })
    await writeFile(path.join(programs, 'simc-1205.01-win64', engine), '')
    await writeFile(path.join(programs, 'simc-1210.01-win64', engine), '')
    expect(await engineFolder(null, [path.join(root, 'missing'), programs])).toBe(path.join(programs, 'simc-1210.01-win64'))
    expect(await engineFolder(path.join(root, 'elsewhere', engine), [programs])).toBe(path.join(root, 'elsewhere'))
    expect(await engineFolder(null, [path.join(root, 'missing')])).toBeUndefined()
  })
  it('uses the command-line engine when the SimulationCraft desktop app is picked', async () => {
    const { root, service } = await fixture()
    const folder = path.join(root, 'simc-1210.01-win64'); await mkdir(folder)
    await writeFile(path.join(folder, app), 'desktop app')
    await expect(service.configureExecutable(path.join(folder, app))).rejects.toThrow(`Choose ${engine}`)
    await writeFile(path.join(folder, engine), 'engine')
    expect(await service.configureExecutable(path.join(folder, app))).toEqual({ configured: true, name: engine })
    expect(JSON.parse(await readFile(path.join(root, 'artifacts', 'engine.json'), 'utf8')).path).toBe(path.join(folder, engine))
  })
})

describe('comparing with top players', () => {
  it('deletes a finished run with its engine files, but not one still running', async () => {
    const { character, service, root } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2', 'companion_candidate_3'], [104_000, 101_000, 105_500]))}));`)
    await service.configureExecutable(process.execPath)
    const job = await service.startBenchmark({ characterId: character.id, activity: 'mythicPlus', scenarioId: 'big-pulls', iterations: 100 }, topFixture())
    await expect(service.deleteJob(character.id, job.id)).rejects.toThrow('Cancel this simulation')
    await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    await service.deleteJob(character.id, job.id)
    expect((await service.list(character.id)).jobs).toEqual([])
    await expect(readFile(path.join(root, 'artifacts', job.id, 'input.simc'), 'utf8')).rejects.toThrow()
    await expect(service.deleteJob(character.id, job.id)).rejects.toThrow('no longer exists')
    await expect(service.deleteJob(character.id, '../engine.json')).rejects.toThrow('no longer exists')
  })
  it('runs the top player items, their talents, and both as profilesets against an unchanged reference', async () => {
    const { character, service, root } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2', 'companion_candidate_3'], [104_000, 101_000, 105_500]))}));`)
    await service.configureExecutable(process.execPath)
    const job = await service.startBenchmark({ characterId: character.id, activity: 'mythicPlus', scenarioId: 'big-pulls', iterations: 100 }, topFixture())
    expect(job.request.candidateLabels).toEqual(["Top players' gear", "Top players' talents", "Top players' gear and talents"])
    expect(job.request.benchmark).toMatchObject({ kinds: ['gear', 'talents', 'both'], players: 10, talentPlayers: 6, swapped: [{ slot: 'head', to: 'Top helm', itemLevel: 112 }, { slot: 'finger1', to: 'Top ring', itemLevel: 111 }] })
    const done = await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    expect(done.jobs[0]!.state).toBe('completed')
    const input = await readFile(path.join(root, 'artifacts', job.id, 'input.simc'), 'utf8')
    expect(input.match(/^profileset\."companion_candidate_1"\+=.*$/gm)).toEqual(['profileset."companion_candidate_1"+=head=,id=2000,ilevel=112', 'profileset."companion_candidate_1"+=finger1=,id=2010,ilevel=111'])
    expect(input.match(/^profileset\."companion_candidate_2"\+=.*$/gm)).toEqual(['profileset."companion_candidate_2"+=talents=TOPBUILD123'])
    expect(input.match(/^profileset\."companion_candidate_3"\+=.*$/gm)).toHaveLength(3)
  })
  it('refuses another specialization or a setup you already match', async () => {
    const { character, service } = await fixture()
    await service.configureExecutable(process.execPath)
    await expect(service.startBenchmark({ characterId: character.id }, topFixture({ specId: 251 }))).rejects.toThrow('another specialization')
    await expect(service.startBenchmark({ characterId: character.id }, topFixture({ slots: {}, builds: [] }))).rejects.toThrow('already wear')
  })
})

describe('simulating a saved plan', () => {
  it('runs the whole plan and each planned upgrade against an unchanged reference', async () => {
    const { character, service, root, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2', 'companion_candidate_3'], [104_000, 102_000, 101_500]))}));`)
    await service.configureExecutable(process.execPath)
    await expect(service.startPlan({ characterId: character.id })).rejects.toThrow('Save a gear plan')
    const stored = database.getCharacter(character.id)!
    database.saveGearDraft({ id: 'plan', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Upgrade plan', items: [{ ...stored.gear[0]!, itemId: 2000, name: 'Planned helm', itemLevel: 120, itemLink: null }, { ...stored.gear[1]! }, { ...stored.gear[4]!, itemLevel: 115 }], updatedAt: '2026-10-29T12:00:00.000Z' })
    const job = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 })
    expect(job.label).toBe('Plan · Upgrade plan')
    expect(job.request.candidateLabels).toEqual(['Whole plan', 'Head: Planned helm at 120', `Chest: ${stored.gear[4]!.name} at 115`])
    expect(job.request.plan).toMatchObject({ name: 'Upgrade plan', whole: 0, skipped: [], swaps: [{ slot: 'head', to: 'Planned helm' }, { slot: 'chest', itemLevel: 115 }] })
    const done = await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    expect(done.jobs[0]!.state).toBe('completed')
    const input = await readFile(path.join(root, 'artifacts', job.id, 'input.simc'), 'utf8')
    expect(input.match(/^profileset\."companion_candidate_1"\+=/gm)).toHaveLength(2)
    expect(input.match(/^profileset\."companion_candidate_2"\+=.*$/gm)).toEqual(['profileset."companion_candidate_2"+=head=,id=2000,ilevel=120'])
  })
  it('runs each top player as they play, measuring every item once', async () => {
    const { character, service, root, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2'], [104_000, 102_000]))}));`)
    await service.configureExecutable(process.execPath)
    const stored = database.getCharacter(character.id)!
    database.saveGearDraft({ id: 'plan', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Upgrade plan', items: [{ ...stored.gear[0]!, itemId: 2000, name: 'Top helm', itemLevel: 112, itemLink: null }, { ...stored.gear[4]!, itemLevel: 115 }], updatedAt: '2026-10-29T12:00:00.000Z' })
    const item = (slot: string, itemId: number, itemLevel: number, extra: object = {}) => ({ slot: slot as 'head', itemId, name: `Item ${itemId}`, itemLevel, bonusIds: [], enchantId: 0, gemIds: [], ...extra })
    const player = (name: string, gear: ReturnType<typeof item>[], loadout: string | null) => ({ name, realm: 'Realm', region: 'us', score: 4000, keyLevel: 20, dungeon: null, url: `https://raider.io/characters/us/realm/${name}`, loadout, gear })
    const top = topFixture({ players: [
      // Same helm as the plan, your own neck, and an enchanted ring with gems
      player('One', [item('head', 2000, 112), item('neck', 1001, 100), item('finger1', 2010, 111, { enchantId: 7973, gemIds: [240890], bonusIds: [6652] })], 'ONEBUILD'),
      // Shares the ring with One, wears no talents we know, and runs without your off hand slot items
      player('Two', [item('finger1', 2010, 111, { enchantId: 7973, gemIds: [240890], bonusIds: [6652] }), item('trinket1', 2012, 120)], null),
      player('No gear', [], null),
    ] })
    const job = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, top)
    expect(job.request.candidateLabels).toEqual(['Whole plan', 'Head: Top helm at 112', `Chest: ${stored.gear[4]!.name} at 115`, 'Top player · One', 'Top player item · Ring 1: Item 2010 at 111', 'Top player · Two', 'Top player item · Trinket 1: Item 2012 at 120'])
    expect(job.request.plan?.top).toBeNull()
    expect(job.request.plan?.roster).toMatchObject({ population: top.population, players: [
      { name: 'One', loadout: 'ONEBUILD', index: 3, singles: [{ slot: 'head', index: 1 }, { slot: 'neck', index: null }, { slot: 'finger1', index: 4 }] },
      { name: 'Two', loadout: null, index: 5, singles: [{ slot: 'finger1', index: 4 }, { slot: 'trinket1', index: 6 }] },
    ] })
    await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    const input = await readFile(path.join(root, 'artifacts', job.id, 'input.simc'), 'utf8')
    expect(input.match(/^profileset\."companion_candidate_4"\+=.*$/gm)).toEqual(['profileset."companion_candidate_4"+=head=,id=2000,ilevel=112', 'profileset."companion_candidate_4"+=neck=,id=1001,ilevel=100', 'profileset."companion_candidate_4"+=finger1=,id=2010,ilevel=111,bonus_id=6652,enchant_id=7973,gem_id=240890/0/0/0', 'profileset."companion_candidate_4"+=talents=ONEBUILD'])
    // A slot their profile lacks keeps yours rather than running empty
    expect(input).not.toMatch(/\+=\w+=$/m)
    const other = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, { ...top, specId: 251 })
    expect(other.request.plan?.roster).toBeNull()
  })
  it("gives a planned item a top player's copy's bonus lists, without their embellishment or variant effect", async () => {
    const { character, service, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1'], [104_000]))}));`, { embellishmentBonusLists: async () => [8960, 12384], bonusInfo: async () => ({ 555: { variant: null, trackGroup: 618 }, 666: { variant: { name: 'Venomcursed', effect: 'Crit', icon: null }, trackGroup: null } }) })
    await service.configureExecutable(process.execPath)
    const stored = database.getCharacter(character.id)!
    database.saveGearDraft({ id: 'plan', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Upgrade plan', items: [
      { ...stored.gear[4]!, itemId: 3100, name: 'Crafted chest', itemLevel: 130, itemLink: null, bonusIds: [] },
    ], updatedAt: '2026-10-29T12:00:00.000Z' })
    const top = topFixture({ players: [{ name: 'One', realm: 'Realm', region: 'us', score: 4000, keyLevel: 20, dungeon: null, url: 'https://raider.io/characters/us/realm/One', loadout: null, gear: [{ slot: 'chest', itemId: 3100, name: 'Crafted chest', itemLevel: 130, bonusIds: [8960, 12384, 555, 666], enchantId: 0, gemIds: [] }] }] })
    const job = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, top)
    const whole = job.request.candidates[0]!
    // Their embellishment and Venomcursed stay off; the plan asked for neither
    expect(whole.find(item => item.slot === 'chest')?.bonusIds).toEqual([555])
    // Their own run keeps the copy they wear
    expect(job.request.candidates[job.request.plan!.roster!.players[0]!.index]!.find(item => item.slot === 'chest')?.bonusIds).toEqual([8960, 12384, 555, 666])
  })
  it("puts a top player's copy of a planned ring or trinket in the plan's slot", async () => {
    const { character, service, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1'], [104_000]))}));`)
    await service.configureExecutable(process.execPath)
    const stored = database.getCharacter(character.id)!
    database.saveGearDraft({ id: 'plan', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Upgrade plan', items: [{ ...stored.gear[0]!, slot: 'trinket1', itemId: 3000, name: 'Heart', itemLevel: 120, inventoryType: 12, itemLink: null, enchant: null, gems: [], gemIds: [], bonusIds: [] }], updatedAt: '2026-10-29T12:00:00.000Z' })
    const item = (slot: string, itemId: number) => ({ slot: slot as 'trinket1', itemId, name: `Item ${itemId}`, itemLevel: 120, bonusIds: [], enchantId: 0, gemIds: [] })
    const top = topFixture({ players: [{ name: 'One', realm: 'Realm', region: 'us', score: 4000, keyLevel: 20, dungeon: null, url: 'https://raider.io/characters/us/realm/One', loadout: null, gear: [item('trinket1', 3001), item('trinket2', 3000)] }] })
    const job = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, top)
    const run = job.request.candidates[job.request.plan!.roster!.players[0]!.index]!
    expect(run.map(entry => [entry.slot, entry.itemId])).toEqual([['trinket2', 3001], ['trinket1', 3000]])
    // Their heart alone replaces the same trinket the plan's does, so it shares the plan's measurement
    expect(job.request.plan!.roster!.players[0]!.singles).toContainEqual({ slot: 'trinket1', index: 0 })
  })
  it("runs the plan's own enchants, gems, embellishments, and talents, and picks the plan you have open", async () => {
    const lookups: unknown[] = []
    const { character, service, root, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2', 'companion_candidate_3', 'companion_candidate_4'], [104_000, 102_000, 101_500, 101_000]))}));`, {
      enhancementIds: async requests => { lookups.push(requests); return requests.map(request => ({ enchantId: request.enchant === 'Amani Mastery' ? 7965 : null, gemIds: request.gems.map(gem => gem === 'Flawless Deadly Peridot' ? 240890 : 0), bonusIds: request.embellishment === 9001 ? [12345] : [] })) },
    })
    await service.configureExecutable(process.execPath)
    const stored = database.getCharacter(character.id)!
    const ring = stored.gear.find(item => item.slot === 'finger1')!
    database.saveGearDraft({ id: 'other', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', plan: 'alt', name: 'Alt plan', talents: { loadout: 'PLAN123+talents', source: 'Built here' },
      items: [{ ...stored.gear[0]!, itemId: 2000, name: 'Planned helm', itemLevel: 120, itemLink: null, gems: ['Flawless Deadly Peridot'], embellishment: { name: 'Woven Dusk', itemId: 9001, limit: 'Embellished' } }, { ...ring, enchant: 'Amani Mastery' }], updatedAt: '2026-10-29T12:00:00.000Z' })
    const job = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100, plan: 'alt' })
    expect(job.label).toBe('Plan · Alt plan')
    expect(job.request.candidateLabels).toEqual(['Whole plan', 'Head: Planned helm at 120', `Ring 1: ${ring.name} at ${ring.itemLevel}`, 'Plan talents'])
    await until(() => service.list(character.id), workspace => workspace.jobs[0]?.state === 'completed' || workspace.jobs[0]?.state === 'failed')
    const input = await readFile(path.join(root, 'artifacts', job.id, 'input.simc'), 'utf8')
    expect(input).toMatch(/profileset\."companion_candidate_1"\+=talents=PLAN123\+talents/)
    expect(input).toMatch(/profileset\."companion_candidate_2"\+=head=,id=2000,ilevel=120,bonus_id=13695\/12345(,enchant_id=\d+)?,gem_id=240890/)
    expect(input).toMatch(/profileset\."companion_candidate_3"\+=finger1=,id=\d+,ilevel=\d+.*enchant_id=7965/)
    expect(input.match(/^profileset\."companion_candidate_4"\+=.*$/gm)).toEqual(['profileset."companion_candidate_4"+=talents=PLAN123+talents'])
    expect(lookups).toHaveLength(1)
  })
  it('caps top players at Myth 6/6 unless the plan itself reaches past it, then uses the highest levels they wear', async () => {
    const { character, service, database } = await fixture(`await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(profilesetJson(['companion_candidate_1', 'companion_candidate_2', 'companion_candidate_3', 'companion_candidate_4'], [104_000, 102_000, 101_500, 106_000]))}));`)
    await service.configureExecutable(process.execPath)
    const stored = database.getCharacter(character.id)!
    const high = topFixture({ players: [{ name: 'One', realm: 'Realm', region: 'us', score: 4000, keyLevel: 20, dungeon: null, url: 'https://raider.io/characters/us/realm/one', loadout: null, gear: [{ slot: 'head', itemId: 2000, name: 'Top helm', itemLevel: 344, bonusIds: [], enchantId: 0, gemIds: [] }] }] })
    const plan = (level: number) => database.saveGearDraft({ id: 'plan', characterId: character.id, specId: 250, activity: 'mythicPlus', rulesetId: 'unknown', name: 'Upgrade plan', items: [{ ...stored.gear[0]!, itemId: 2000, name: 'Planned helm', itemLevel: level, itemLink: null }, { ...stored.gear[4]!, itemLevel: 115 }], updatedAt: '2026-10-29T12:00:00.000Z' })
    plan(120)
    const capped = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, high)
    expect(capped.request.plan?.roster).toMatchObject({ cap: 334, beyondCap: false })
    expect(capped.request.candidates[capped.request.plan!.roster!.players[0]!.index]!.find(item => item.slot === 'head')?.itemLevel).toBe(334)
    await until(() => service.list(character.id), workspace => workspace.jobs.every(job => job.state !== 'queued' && job.state !== 'running'))
    plan(344)
    const chosen = await service.startPlan({ characterId: character.id, activity: 'mythicPlus', iterations: 100 }, high)
    expect(chosen.request.candidateLabels).toContain('Head: Planned helm at 344')
    expect(chosen.request.plan?.roster).toMatchObject({ cap: null, beyondCap: true })
    expect(chosen.request.candidates[chosen.request.plan!.roster!.players[0]!.index]!.find(item => item.slot === 'head')?.itemLevel).toBe(344)
    await until(() => service.list(character.id), workspace => workspace.jobs.every(job => job.state !== 'queued' && job.state !== 'running'))
  })
})
