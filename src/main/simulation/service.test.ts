import { afterEach, describe, expect, it } from 'vite-plus/test'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseRepository } from '../../workers/database/repository'
import type { DatabaseClient } from '../database'
import { createSimulationService, engineFolder } from './service'
import { exportCharacterProfile } from './profiles'
import { profilesetJson, simulationCharacter, simulationJson } from './fixtures'

const databases: DatabaseRepository[] = []
const directories: string[] = []
const services: ReturnType<typeof createSimulationService>[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.close(); for (const db of databases.splice(0)) db.close(); for (const directory of directories.splice(0)) { if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'wow-simulation-service-'))) throw new Error('Unexpected test directory'); await rm(directory, { recursive: true, force: true }) } })
async function fixture(body?: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'wow-simulation-service-')); directories.push(root)
  const database = new DatabaseRepository(':memory:'); databases.push(database)
  const character = database.addCharacter(simulationCharacter())
  const bridge = { call: async (method: keyof DatabaseRepository, ...args: unknown[]) => (database[method] as (...args: unknown[]) => unknown).apply(database, args) } as Pick<DatabaseClient, 'call'>
  const file = path.join(root, 'engine-fixture.mjs')
  await writeFile(file, `import fs from 'node:fs/promises'; ${body ?? `await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(simulationJson())}));`}`)
  const service = createSimulationService({ db: bridge, artifactDir: path.join(root, 'artifacts'), execution: { launch: (_executable, args, cwd) => spawn(process.execPath, [file, ...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) } }); services.push(service)
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
