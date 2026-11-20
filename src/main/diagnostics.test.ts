import { afterEach, describe, expect, it } from 'vite-plus/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { diagnosticsText, redact } from './diagnostics'
import { logFileName, scrub } from './log'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
const home = 'C:\\Users\\someone'

describe('diagnostics', () => {
  it('hides credential-looking values, the home folder, and character names', () => {
    const text = `Authorization: Bearer abcdefghijklmnop12345 · access_token=zzzzzzzzzz · ${home}\\AppData · C:/Users/someone/x · Dolimight-Gurubashi · ${'f'.repeat(64)}`
    const safe = redact(text, home, ['Dolimight', 'Gurubashi'])
    expect(safe).not.toContain('abcdefghijklmnop12345')
    expect(safe).not.toContain('zzzzzzzzzz')
    expect(safe).not.toContain('someone')
    expect(safe).not.toContain('Dolimight')
    expect(safe).not.toContain('f'.repeat(64))
    expect(safe).toContain('~\\AppData')
    expect(safe).toContain('~/x')
    expect(safe).toContain('[character]-[character]')
  })

  it('keeps tokens out of the daily log, even inside an error message', () => {
    const line = JSON.stringify(scrub({ error: new Error('request failed: Authorization: Bearer abcdefghijklmnop12345'), body: 'access_token=zzzzzzzzzz&x=1' }))
    expect(line).not.toContain('abcdefghijklmnop12345')
    expect(line).not.toContain('zzzzzzzzzz')
    expect(line).toContain('Bearer [hidden]')
  })

  it('reports versions, settings, connections, and the recent log without secrets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'wow-diagnostics-')); directories.push(directory)
    const now = new Date('2026-11-20T12:00:00.000Z')
    await writeFile(path.join(directory, logFileName(now)), '2026-11-20T11:59:00.000Z INFO  [sync] Synced Dolimight\n')
    const text = await diagnosticsText({
      app: { version: '0.1.1', packaged: true, platform: 'win32', arch: 'x64', os: '10.0.26300', electron: '44.7.2' },
      settings: { wowInstallPath: `${home}\\Games\\World of Warcraft`, aiProvider: 'claude', apiSecret: 'hush' },
      simulationCraft: { configured: true },
      ai: { selected: 'claude', providers: [{ id: 'claude', installed: true, signedIn: true, version: '2.1' }, { id: 'codex', installed: false, signedIn: null, version: null }] },
      sync: { finishedAt: '2026-11-20T11:59:00.000Z', results: [{ ok: true }, { ok: false, error: 'offline' }] },
      gameData: { state: 'ready' }, characters: 2, names: ['Dolimight'], logDirectory: directory, now, home,
    })
    expect(text).toContain('WOW Companion 0.1.1 · win32 x64')
    expect(text).toContain('SimulationCraft: chosen')
    expect(text).toContain('claude installed 2.1, signed in · codex not installed')
    expect(text).toContain('2 characters, 1 could not update')
    expect(text).toContain('Synced [character]')
    expect(text).not.toContain('hush')
    expect(text).not.toContain('someone')
  })
})
