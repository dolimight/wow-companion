import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createLog, expiredLogs, scrub } from './log'

const temps: string[] = []
afterEach(async () => { await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })

describe('troubleshooting log', () => {
  it('writes one line per entry to the day\'s file, hiding secrets', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wowc-log-')); temps.push(directory)
    const log = createLog({ directory, now: () => new Date('2026-11-18T10:00:00.000Z') })
    log.info('simulation', 'Started', { job: 'a', clientSecret: 'shh', nested: { accessToken: 'shh' } })
    log.error('app', 'Broke', new Error('boom'))
    await log.flush()
    const text = await readFile(path.join(directory, 'companion-2026-11-18.log'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('2026-11-18T10:00:00.000Z INFO  [simulation] Started {"job":"a","clientSecret":"[hidden]","nested":{"accessToken":"[hidden]"}}')
    expect(lines[1]).toContain('ERROR [app] Broke {"name":"Error","message":"boom"')
    expect(text).not.toContain('shh')
  })

  it('purges files older than yesterday and leaves anything else alone', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wowc-log-')); temps.push(directory)
    for (const name of ['companion-2026-11-15.log', 'companion-2026-11-17.log', 'companion-2026-11-18.log', 'notes.txt']) await writeFile(path.join(directory, name), '')
    await createLog({ directory, now: () => new Date('2026-11-18T01:00:00.000Z') }).purge()
    expect((await readdir(directory)).sort()).toEqual(['companion-2026-11-17.log', 'companion-2026-11-18.log', 'notes.txt'])
    expect(expiredLogs(['companion-2026-11-16.log'], new Date('2026-11-18T23:00:00.000Z'))).toEqual(['companion-2026-11-16.log'])
  })

  it('keeps long values and deep objects to a readable size', () => {
    expect(String(scrub('x'.repeat(5000))).length).toBeLessThan(4100)
    expect(scrub({ a: { b: { c: { d: { e: { f: 1 } } } } } })).toEqual({ a: { b: { c: { d: { e: '…' } } } } })
  })
})
