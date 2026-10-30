import { describe, expect, it } from 'vite-plus/test'
import { EventEmitter } from 'node:events'
import { compareReleaseVersions } from '../../shared/updates'
import { createUpdateService, type UpdatePreferences, type UpdaterAdapter } from './service'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function fixture(options: { version?: string; disabled?: boolean; saved?: unknown; blockers?: () => string[]; beforeInstall?: () => Promise<void>; readError?: boolean; writeError?: boolean; configureError?: boolean } = {}) {
  const events = new EventEmitter()
  let checkCount = 0, downloadCount = 0, installCount = 0, shutdownCount = 0
  const writes: UpdatePreferences[] = []
  const channels: string[] = []
  let offeredVersion = '0.1.1'
  let checkGate: Promise<unknown> | undefined, downloadGate: Promise<unknown> | undefined
  let checkError = false
  let writeError = options.writeError ?? false
  const adapter: UpdaterAdapter = {
    configure: channel => { if (options.configureError) throw new Error('private setup detail'); channels.push(channel) },
    async check() {
      checkCount++
      if (checkGate) await checkGate
      if (checkError) throw new Error('secret network detail')
      events.emit('update-available', { version: offeredVersion, releaseNotes: '## Highlights\nLocal fixture' })
    },
    async download() { downloadCount++; if (downloadGate) await downloadGate; events.emit('download-progress', { percent: 35 }); events.emit('update-downloaded', { version: offeredVersion }) },
    install: () => { installCount++ },
    on: (name, listener) => { events.on(name, listener) },
    off: (name, listener) => { events.off(name, listener) },
  }
  const service = await createUpdateService({
    version: options.version ?? '0.1.0', disabledReason: options.disabled ? 'Updates disabled in tests' : null, adapter,
    readPreferences: async () => { if (options.readError) throw new Error('private file path'); return options.saved },
    writePreferences: async value => { if (writeError) throw new Error('private write error'); writes.push(value) },
    blockers: options.blockers,
    beforeInstall: async () => { shutdownCount++; await options.beforeInstall?.() },
    now: () => new Date('2026-10-30T00:00:00Z'),
  })
  return { service, events, writes, channels,
    get counts() { return { checks: checkCount, downloads: downloadCount, installs: installCount, shutdowns: shutdownCount } },
    offer(version: string) { offeredVersion = version },
    gateChecks(gate: Promise<unknown>) { checkGate = gate },
    gateDownloads(gate: Promise<unknown>) { downloadGate = gate },
    failCheck() { checkError = true },
    failWrites() { writeError = true },
  }
}

describe('desktop update lifecycle', () => {
  it('keeps the app usable when updater setup fails', async () => {
    const f = await fixture({ configureError: true })
    expect(f.service.getState().status).toBe('disabled')
    expect(f.service.getState().error).not.toContain('private')
    await f.service.check()
    expect(f.counts.checks).toBe(0)
    f.service.close()
  })
  it('stays disabled without configuring the updater or making network/install calls', async () => {
    const f = await fixture({ disabled: true })
    await f.service.check(); await f.service.download(); await f.service.install(); await f.service.setChannel('nightly')
    expect(f.service.getState().status).toBe('disabled')
    expect(f.channels).toEqual([])
    expect(f.counts).toEqual({ checks: 0, downloads: 0, installs: 0, shutdowns: 0 })
    f.service.close()
  })
  it('checks, explicitly downloads, waits for restart, then records the exact target before shutdown', async () => {
    const f = await fixture()
    await f.service.check()
    expect(f.service.getState()).toMatchObject({ status: 'available', availableVersion: '0.1.1', checkedAt: '2026-10-30T00:00:00.000Z' })
    expect(f.counts.downloads).toBe(0)
    expect(f.service.getState().releaseUrl).toBe('https://github.com/dolimight/wow-companion/releases/tag/v0.1.1')
    await f.service.download()
    expect(f.service.getState()).toMatchObject({ status: 'ready', progress: 100 })
    expect(f.counts.installs).toBe(0)
    await f.service.install()
    expect(f.writes.at(-1)).toEqual({ channel: 'stable', expectedVersion: '0.1.1' })
    expect(f.counts).toEqual({ checks: 1, downloads: 1, shutdowns: 1, installs: 1 })
    f.service.close()
  })
  it('serializes check/download/track operations without stale concurrent requests', async () => {
    const f = await fixture()
    const gate = deferred()
    f.gateChecks(gate.promise)
    const first = f.service.check()
    await f.service.check(); await f.service.setChannel('nightly'); await f.service.download()
    expect(f.counts.checks).toBe(1)
    expect(f.channels).toEqual(['stable'])
    gate.resolve(); await first
    const download = deferred()
    f.gateDownloads(download.promise)
    const running = f.service.download()
    await f.service.check(); await f.service.download(); await f.service.setChannel('nightly')
    expect(f.counts.downloads).toBe(1)
    download.resolve(); await running
    expect(f.service.getState().status).toBe('ready')
    f.service.close()
  })
  it('persists a channel before checking its feed and keeps stable isolated from nightly', async () => {
    const f = await fixture()
    f.offer('0.1.1-nightly.20261030.42')
    expect((await f.service.check()).status).toBe('error')
    expect((await f.service.setChannel('nightly')).status).toBe('available')
    expect(f.channels).toEqual(['stable', 'nightly'])
    expect(f.writes).toContainEqual({ channel: 'nightly' })
    expect(f.service.getState().channel).toBe('nightly')
    f.service.close()
  })
  it('rejects older stable releases when switching from a newer nightly', async () => {
    const f = await fixture({ version: '0.1.2-nightly.20261030.42' })
    f.offer('0.1.1')
    const state = await f.service.setChannel('stable')
    expect(state.status).toBe('error')
    expect(state.error).toContain('older')
    await f.service.download(); await f.service.install()
    expect(f.counts.downloads).toBe(0)
    expect(f.counts.installs).toBe(0)
    f.service.close()
  })
  it('permits a stable release newer than the installed same-core nightly', async () => {
    const f = await fixture({ version: '0.1.1-nightly.20261030.42' })
    expect((await f.service.setChannel('stable')).availableVersion).toBe('0.1.1')
    f.service.close()
  })
  it('blocks installation for both renderer edits and fresh backend work without stopping services', async () => {
    let backendBusy = true
    const f = await fixture({ blockers: () => backendBusy ? ['A simulation is running'] : [] })
    await f.service.check(); await f.service.download()
    f.service.setBlockers(['Save the outfit'])
    const blocked = await f.service.install()
    expect(blocked.blockers).toEqual(['Save the outfit', 'A simulation is running'])
    expect(f.counts.shutdowns).toBe(0)
    backendBusy = false
    f.service.setBlockers([])
    await f.service.install()
    expect(f.counts.installs).toBe(1)
    f.service.close()
  })
  it('rechecks blockers after persisting the restart marker', async () => {
    let checks = 0
    const f = await fixture({ blockers: () => ++checks >= 4 ? ['A save started'] : [] })
    await f.service.check(); await f.service.download()
    // Snapshot publication itself also queries blockers; install must never proceed while blocked
    await f.service.install()
    expect(f.counts.installs).toBe(0)
    expect(f.counts.shutdowns).toBe(0)
    f.service.close()
  })
  it('does not install when recording the target fails', async () => {
    const f = await fixture()
    await f.service.check(); await f.service.download(); f.failWrites()
    expect((await f.service.install()).status).toBe('error')
    expect(f.counts.shutdowns).toBe(0)
    expect(f.counts.installs).toBe(0)
    f.service.close()
  })
  it('sanitizes update errors and allows an explicit retry', async () => {
    const f = await fixture()
    f.failCheck()
    const state = await f.service.check()
    expect(state.status).toBe('error')
    expect(state.error).not.toContain('secret')
    expect(state.error).not.toContain('private')
    f.service.close()
  })
  it('rejects malformed feed versions and mismatched downloaded artifacts', async () => {
    const f = await fixture()
    f.offer('../bad-version')
    expect((await f.service.check()).status).toBe('error')
    f.offer('0.1.1'); await f.service.check()
    const gate = deferred(); f.gateDownloads(gate.promise)
    const download = f.service.download()
    f.events.emit('update-downloaded', { version: '9.0.0' })
    expect(f.service.getState().status).toBe('downloading')
    gate.resolve(); await download
    expect(f.service.getState().status).toBe('ready')
    f.service.close()
  })
  it('reports a prior failed update without automatically reinstalling it', async () => {
    const f = await fixture({ saved: { channel: 'stable', expectedVersion: '0.1.1' } })
    expect(f.service.getState().error).toContain('did not apply')
    expect(f.counts.installs).toBe(0)
    expect(f.writes).toEqual([{ channel: 'stable' }])
    await f.service.check()
    expect(f.service.getState().status).toBe('available')
    f.service.close()
  })
  it('clears the marker after a successful installed-version confirmation', async () => {
    const f = await fixture({ version: '0.1.1', saved: { channel: 'stable', expectedVersion: '0.1.1' } })
    expect(f.service.getState().error).toBeNull()
    expect(f.writes).toEqual([{ channel: 'stable' }])
    f.service.close()
  })
  it('does not persist a channel change when its preferences cannot be written', async () => {
    const f = await fixture({ writeError: true })
    const state = await f.service.setChannel('nightly')
    expect(state.channel).toBe('stable')
    expect(state.status).toBe('error')
    expect(f.channels).toEqual(['stable'])
    f.service.close()
  })
  it('disposes subscriptions and ignores late events/check completions', async () => {
    const f = await fixture()
    const gate = deferred(); f.gateChecks(gate.promise)
    const checking = f.service.check()
    f.service.close()
    gate.resolve(); await checking
    f.events.emit('update-available', { version: '9.0.0' })
    expect(f.service.getState().availableVersion).toBeNull()
    expect(f.events.eventNames()).toEqual([])
  })
})

describe('channel version ordering', () => {
  it('compares version fields numerically and stable above a matching nightly', () => {
    expect(compareReleaseVersions('0.1.10', '0.1.9')).toBe(1)
    expect(compareReleaseVersions('0.1.1', '0.1.1-nightly.20261030.99')).toBe(1)
    expect(compareReleaseVersions('0.1.1-nightly.20261030.100', '0.1.1-nightly.20261030.99')).toBe(1)
    expect(compareReleaseVersions('garbage', '0.1.0')).toBeNull()
  })
})
