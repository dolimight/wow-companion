import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { bossCoachOutputSchema, type BossCoachInput } from '../../shared/ai'
import { characterSchema } from '../../shared/domain'
import { findExecutable, launcherFor, runCli } from './cli'
import { bossCoach } from './features/boss-coach'
import { createAiService } from './service'
import type { AiProvider } from './types'

const temps: string[] = []
const temp = async () => { const dir = await mkdtemp(path.join(os.tmpdir(), 'wowc-ai-')); temps.push(dir); return dir }
afterEach(async () => { await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })

const input: BossCoachInput = { characterId: 'c1', instance: "Kings' Rest", difficulty: 'Mythic+', boss: 'The Golden Serpent', role: 'damage', notes: ['Cleave the Animated Gold'] }
const mage = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Alwin', className: 'Mage', specName: 'Arcane', specId: 62 })

describe('assistant CLIs', () => {
  it('finds a command on PATH or in an installer folder', async () => {
    const onPath = await temp(), installed = await temp()
    await writeFile(path.join(installed, 'codex'), '')
    expect(await findExecutable('codex', [installed], { PATH: onPath }, 'linux')).toBe(path.join(installed, 'codex'))
    expect(await findExecutable('claude', [installed], { PATH: onPath }, 'linux')).toBeNull()
  })

  it('runs an npm shim through its script, never a shell', async () => {
    const dir = await temp()
    await writeFile(path.join(dir, 'codex.cmd'), '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n')
    const launcher = await launcherFor(path.join(dir, 'codex.cmd'), 'node-runtime')
    expect(launcher).toEqual({ command: 'node-runtime', prefix: [path.join(dir, 'node_modules\\@openai\\codex\\bin\\codex.js')], env: { ELECTRON_RUN_AS_NODE: '1' } })
    await writeFile(path.join(dir, 'odd.cmd'), 'start something.exe')
    await expect(launcherFor(path.join(dir, 'odd.cmd'))).rejects.toThrow('install the standalone build')
    expect(await launcherFor('/usr/bin/claude')).toEqual({ command: '/usr/bin/claude', prefix: [] })
  })

  it('passes the prompt on stdin and stops a command that runs too long', async () => {
    const dir = await temp()
    const echo = path.join(dir, 'echo.js'), hang = path.join(dir, 'hang.js')
    await writeFile(echo, 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(s.toUpperCase()+process.argv[2])})')
    await writeFile(hang, 'setInterval(()=>{},1000)')
    const node = { command: process.execPath, prefix: [] }
    await expect(runCli({ ...node, prefix: [echo] }, ['!'], { input: 'tips' })).resolves.toMatchObject({ stdout: 'TIPS!', code: 0 })
    await expect(runCli({ ...node, prefix: [hang] }, [], { timeoutMs: 300 })).rejects.toThrow('No answer after 1 s')
  })
})

describe('AI service', () => {
  const provider = (answer: unknown, seen: Array<{ prompt: string; workDir: string }> = []): AiProvider => ({
    id: 'fake', name: 'Fake', description: 'A test assistant',
    detect: async () => ({ installed: true, version: '1.0', signedIn: true, detail: 'Signed in' }),
    run: async request => { seen.push(request); return answer },
  })

  it('asks the picked provider with the feature prompt and checks the answer', async () => {
    const seen: Array<{ prompt: string; workDir: string }> = []
    const scratchDir = await temp()
    const ai = createAiService({ providers: [provider({ tips: [' Cast Arcane Orb into the gold ', ''], cooldowns: [{ ability: 'Ring of Frost', when: 'On Lucre\'s Call' }] }, seen)], selected: async () => 'fake', character: async () => mage, scratchDir })
    const answer = await ai.ask('bossCoach', input)
    expect(answer.provider).toBe('Fake')
    expect(answer.value).toEqual({ tips: ['Cast Arcane Orb into the gold'], cooldowns: [{ ability: 'Ring of Frost', when: 'On Lucre\'s Call' }] })
    expect(seen[0]?.prompt).toContain('Arcane Mage')
    expect(seen[0]?.prompt).toContain('- Cleave the Animated Gold')
    // Each question's folder is removed afterwards
    expect(await readdir(scratchDir)).toEqual([])
  })

  it('refuses without a provider and rejects an answer in the wrong shape', async () => {
    const scratchDir = await temp()
    const off = createAiService({ providers: [provider({})], selected: async () => null, character: async () => mage, scratchDir })
    await expect(off.ask('bossCoach', input)).rejects.toThrow('Connect an AI assistant in Settings first')
    const wrong = createAiService({ providers: [provider({ answer: 'hi' })], selected: async () => 'fake', character: async () => mage, scratchDir })
    await expect(wrong.ask('bossCoach', input)).rejects.toThrow("answered in a shape the app can't use")
  })

  it('reports each provider, ignoring a picked one that no longer exists', async () => {
    const ai = createAiService({ providers: [provider({})], selected: async () => 'gone', character: async () => null, scratchDir: await temp() })
    expect(await ai.status()).toEqual({ selected: null, providers: [{ id: 'fake', name: 'Fake', description: 'A test assistant', installed: true, version: '1.0', signedIn: true, detail: 'Signed in' }] })
  })
})

describe('boss coach', () => {
  it('builds on the page notes and names the player', () => {
    const prompt = bossCoach.prompt(input, { character: mage })
    expect(prompt).toContain('Player: Arcane Mage, playing as a damage dealer')
    expect(prompt).toContain("Fight: The Golden Serpent in Kings' Rest, Mythic+")
    expect(bossCoach.prompt({ ...input, notes: [] }, { character: null })).toContain('no written strategy')
  })

  it('caps a long answer instead of refusing it', () => {
    const parsed = bossCoachOutputSchema.parse({ tips: Array.from({ length: 9 }, (_, at) => `Tip ${at}`), cooldowns: [] })
    expect(parsed.tips).toHaveLength(6)
    expect(bossCoachOutputSchema.safeParse({ tips: [' '], cooldowns: [] }).success).toBe(false)
  })
})
