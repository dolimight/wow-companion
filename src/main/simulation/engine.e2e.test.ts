// A real SimulationCraft round trip, run only in CI where SIMC_IMAGE names the engine's Docker image. It never runs on
// a player's computer: the engine is heavy enough to reset a machine with unstable power or cooling
import { afterAll, describe, expect, it } from 'vite-plus/test'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gearItemSchema, type GearSlot } from '../../shared/domain'
import type { SimulationRequest } from '../../shared/simulation'
import { simulationRequest } from './fixtures'
import { itemLine } from './profiles'
import { parseSimulationReport, REFERENCE_PROFILESET, runSimulationProcess } from './runner'

const image = process.env.SIMC_IMAGE
const directories: string[] = []
afterAll(async () => { for (const directory of directories) await rm(directory, { recursive: true, force: true }) })

/** Runs a shell command inside the engine image and returns its output */
const inImage = (command: string) => execFileSync('docker', ['run', '--rm', '--entrypoint', 'sh', image!, '-c', command], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()

/** The parts of a profile's gear line this app writes, such as head=,id=1,bonus_id=2/3,enchant_id=4 */
function gearFrom(line: string, slot: GearSlot) {
  const field = (name: string) => line.match(new RegExp(`(?:^|,)${name}=([^,]+)`))?.[1]
  const numbers = (name: string) => field(name)?.split('/').map(Number).filter(Number.isFinite) ?? []
  return gearItemSchema.parse({ slot, itemId: Number(field('id')), name: `Sample ${slot}`, itemLevel: Number(field('ilevel') ?? 0) || null, bonusIds: numbers('bonus_id'), enchantId: Number(field('enchant_id') ?? 0) || null, gemIds: numbers('gem_id') })
}

describe.skipIf(!image)('SimulationCraft round trip', () => {
  it('runs a profile with the app\'s own profileset lines and reads the report back', async () => {
    const engine = inImage('find / -type f -name simc -perm -u+x 2>/dev/null | head -1')
    const sample = inImage('find / -type f -path "*profiles*" -iname "*Death_Knight_Blood*.simc" 2>/dev/null | grep -v -i ptr | sort | tail -1')
    expect(engine).not.toBe('')
    expect(sample).not.toBe('')
    const text = inImage(`cat "${sample}"`)
    // The sample's actor takes the name the report parser expects, and its own head becomes the measured piece
    const profile = text.replace(/^(\w+)=("[^"]*"|\S+)/m, '$1=companion_baseline')
    const head = text.match(/^head=(.*)$/m)?.[1]
    expect(head).toBeTruthy()
    const worn = gearFrom(head!, 'head')
    const level = worn.itemLevel ?? 600
    const reference = itemLine({ ...worn, itemLevel: level }).text!
    const upgraded = itemLine({ ...worn, itemLevel: level + 13 }).text!
    const input = `${profile}\n${`profileset."${REFERENCE_PROFILESET}"+=${reference}`}\nprofileset."companion_candidate_1"+=${upgraded}\n`

    const base = simulationRequest()
    const request: SimulationRequest = { ...base, mode: 'profileset', // Only the count matters to the report parser, which names each candidate by its position
    candidates: [[{ ...worn, itemLevel: level + 13 }]] as unknown as SimulationRequest['candidates'], candidateLabels: ['Upgraded head'], options: { iterations: 300, threads: 2, timeoutMinutes: 10 } }
    const directory = await mkdtemp(path.join(tmpdir(), 'wow-simc-e2e-'))
    directories.push(directory)
    const job = path.join(directory, 'job')
    // The engine runs inside its image with the job folder mounted, as the current user so the files stay removable
    const user = process.getuid && process.getgid ? ['--user', `${process.getuid()}:${process.getgid()}`] : []
    const launch = (_executable: string, args: string[], cwd: string) => spawn('docker', ['run', '--rm', ...user, '-v', `${cwd}:/work`, '-w', '/work', '--entrypoint', engine, image!, ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const report = await runSimulationProcess({ executable: engine, directory: job, profile: input, request, launch, timeoutMs: 10 * 60_000 }).promise
    const result = parseSimulationReport(report, request, 'ci', 'e2e', new Date().toISOString(), true)

    expect(result.engine.version).toBeTruthy()
    expect(result.values.map(value => value.name)).toEqual(['companion_baseline', 'companion_candidate_1'])
    for (const value of result.values) {
      expect(value.mean).toBeGreaterThan(0)
      expect(value.standardError).toBeGreaterThan(0)
    }
  }, 15 * 60_000)
})
