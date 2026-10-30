import { afterEach, describe, expect, it } from 'vite-plus/test'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSimulationReport, runSimulationProcess } from './runner'
import { simulationJson, simulationRequest } from './fixtures'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) { if (!path.resolve(directory).startsWith(path.join(tmpdir(), 'wow-simulation-test-'))) throw new Error('Unexpected test directory'); await rm(directory, { recursive: true, force: true }) } })
async function directory() { const directory = await mkdtemp(path.join(tmpdir(), 'wow-simulation-test-')); directories.push(directory); return directory }
async function launchScript(root: string, body: string) {
  const file = path.join(root, 'fixture.mjs')
  await writeFile(file, `import fs from 'node:fs/promises';\n${body}`)
  return (_executable: string, args: string[], cwd: string) => spawn(process.execPath, [file, ...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
}
describe('managed local simulation process', () => {
  it('runs an isolated process with fixed argument arrays and bounded local artifacts', async () => {
    const root = await directory()
    const launch = await launchScript(root, `await fs.writeFile('args.json',JSON.stringify(process.argv.slice(2))); await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(simulationJson())}));`)
    const cwd = path.join(root, 'job')
    const process = runSimulationProcess({ executable: 'explicit-test-executable', directory: cwd, profile: 'death_knight=companion_baseline\nspec=blood\n', request: simulationRequest(), launch })
    expect(await process.promise).toEqual(simulationJson())
    const args = JSON.parse(await readFile(path.join(cwd, 'args.json'), 'utf8')) as string[]
    expect(args).toContain('item_db_source=local')
    expect(args).toContain('json2=result.json')
    expect(args).not.toContain('shell=true')
    expect(await readFile(path.join(cwd, 'input.simc'), 'utf8')).toContain('companion_baseline')
  })
  it('kills a stalled process at its configured time limit', async () => {
    const root = await directory()
    const launch = await launchScript(root, 'setInterval(()=>{},1000);')
    const running = runSimulationProcess({ executable: 'test', directory: path.join(root, 'job'), profile: 'fixture', request: simulationRequest(), launch, timeoutMs: 100 })
    await expect(running.promise).rejects.toThrow('time limit')
  })
  it('cancels without accepting a report written before process completion', async () => {
    const root = await directory()
    const launch = await launchScript(root, `await fs.writeFile('result.json',JSON.stringify(${JSON.stringify(simulationJson())}));setInterval(()=>{},1000);`)
    const running = runSimulationProcess({ executable: 'test', directory: path.join(root, 'job'), profile: 'fixture', request: simulationRequest(), launch })
    setTimeout(() => running.cancel(), 100)
    await expect(running.promise).rejects.toThrow('cancelled')
  })
  it('rejects oversized reports and excessive stdout instead of importing partial output', async () => {
    const root = await directory()
    const bigReport = await launchScript(root, "await fs.writeFile('result.json','x'.repeat(2048));")
    await expect(runSimulationProcess({ executable: 'test', directory: path.join(root, 'report'), profile: 'fixture', request: simulationRequest(), launch: bigReport, resultLimit: 1024 }).promise).rejects.toThrow('size limit')
    const bigLog = await launchScript(root, "process.stdout.write('x'.repeat(2*1024*1024));setInterval(()=>{},1000);")
    await expect(runSimulationProcess({ executable: 'test', directory: path.join(root, 'log'), profile: 'fixture', request: simulationRequest(), launch: bigLog }).promise).rejects.toThrow('output exceeded')
  })
  it('rejects unsupported report adapters and a mismatched actor population', () => {
    const request = simulationRequest()
    const report = simulationJson()
    expect(() => parseSimulationReport({ ...report, report_version: '99.0.0' }, request, 'hash', 'artifact', request.context.now, true)).toThrow()
    report.sim.players[0]!.name = 'unrelated_actor'
    expect(() => parseSimulationReport(report, request, 'hash', 'artifact', request.context.now, true)).toThrow('requested character')
  })
  it('retains engine build mismatch and unknown uncertainty as explicit unsupported facts', () => {
    const request = simulationRequest()
    const report = simulationJson()
    report.sim.options.dbc.live.build_level = 99999
    delete (report.sim.players[0]!.collected_data.dps as { mean_std_dev?: number }).mean_std_dev
    const parsed = parseSimulationReport(report, request, 'hash', 'artifact', request.context.now, true)
    expect(parsed.applicability).toBe('unsupported')
    expect(parsed.values[0]!.standardError).toBeNull()
    expect(parsed.engine.gameBuild).toBe('12.1.5.99999')
  })
})
