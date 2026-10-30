import { isUpdateChannel, compareReleaseVersions, releaseVersion, type UpdateChannel, type UpdateState } from '../../shared/updates'

type Info = { version: string; releaseNotes?: string | Array<{ version: string; note: string | null }> | null }
export type UpdaterAdapter = {
  configure(channel: UpdateChannel): void
  check(): Promise<unknown>
  download(): Promise<unknown>
  install(): void
  on(event: string, listener: (...args: any[]) => void): void
  off(event: string, listener: (...args: any[]) => void): void
}
export type UpdatePreferences = { channel: UpdateChannel; expectedVersion?: string }
type Options = {
  version: string
  disabledReason?: string | null
  adapter: UpdaterAdapter
  readPreferences(): Promise<unknown>
  writePreferences(value: UpdatePreferences): Promise<void>
  blockers?(): string[]
  beforeInstall(): Promise<void>
  now?(): Date
  changed?(state: UpdateState): void
}

/** All updater writes and transitions are serialized through this main-process owner */
export async function createUpdateService(options: Options) {
  let preferences: UpdatePreferences = { channel: options.version.includes('-nightly.') ? 'nightly' : 'stable' }
  let preferenceError = false
  try {
    const saved = await options.readPreferences() as Partial<UpdatePreferences> | null
    if (saved && isUpdateChannel(saved.channel)) preferences = { channel: saved.channel, ...(typeof saved.expectedVersion === 'string' && releaseVersion(saved.expectedVersion) ? { expectedVersion: saved.expectedVersion } : {}) }
  } catch { preferenceError = true }
  let state: UpdateState = {
    currentVersion: options.version, channel: preferences.channel,
    status: options.disabledReason ? 'disabled' : 'idle',
    availableVersion: null, progress: null, releaseNotes: null, releaseUrl: null,
    checkedAt: null, error: preferenceError ? 'Update preferences could not be read' : null,
    disabledReason: options.disabledReason ?? null, blockers: [],
  }
  let closed = false
  let active = false
  let failedInstallVersion: string | null = null
  const localBlockers = new Set<string>()
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const listeners: Array<[string, (...args: any[]) => void]> = []
  const blockers = () => [...new Set([...localBlockers, ...(options.blockers?.() ?? [])])]
  const snapshot = (): UpdateState => ({ ...state, blockers: blockers() })
  const publish = (patch: Partial<UpdateState> = {}) => {
    if (closed) return
    state = { ...state, ...patch }
    options.changed?.(snapshot())
  }
  const failure = (message: string) => publish({ status: 'error', error: message, progress: null })
  const disabled = () => closed || !!state.disabledReason
  const validCandidate = (info: Info) => {
    const parsed = typeof info?.version === 'string' && releaseVersion(info.version)
    if (!parsed || (state.channel === 'stable' && parsed.nightly)) { failure('The release does not match this update track'); return false }
    const comparison = compareReleaseVersions(info.version, options.version)
    if (comparison === null || comparison <= 0) {
      if (comparison !== 0) failure('This release is older than your installed version · Stay on this track until a compatible release is available')
      else publish({ status: 'idle', availableVersion: null, error: null })
      return false
    }
    if (info.version === failedInstallVersion) { failure('The previous update did not apply · Check for updates again before retrying'); return false }
    return true
  }
  const listen = (event: string, callback: (...args: any[]) => void) => {
    const guarded = (...args: any[]) => { if (!closed && !state.disabledReason) callback(...args) }
    options.adapter.on(event, guarded); listeners.push([event, guarded])
  }
  if (!state.disabledReason) {
    try { options.adapter.configure(state.channel) }
    catch { publish({ status: 'disabled', disabledReason: 'Automatic updates are unavailable in this installation', error: 'Could not initialize updates · Reinstall an official release build to repair updates' }) }
    listen('update-available', (info: Info) => {
      if (!validCandidate(info)) return
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : Array.isArray(info.releaseNotes) ? info.releaseNotes.filter(value => value && typeof value.version === 'string' && (typeof value.note === 'string' || value.note === null)).map(value => `${value.version}\n${value.note ?? ''}`).join('\n\n') : null
      publish({ status: 'available', availableVersion: info.version, releaseNotes: notes?.slice(0, 24000) ?? null, releaseUrl: `https://github.com/dolimight/wow-companion/releases/tag/v${encodeURIComponent(info.version)}`, progress: null, error: null })
    })
    listen('update-not-available', () => publish({ status: 'idle', availableVersion: null, progress: null, releaseNotes: null, releaseUrl: null, error: null }))
    listen('download-progress', (progress: { percent?: number }) => { if (state.status === 'downloading' && progress && Number.isFinite(progress.percent)) publish({ progress: Math.max(0, Math.min(100, progress.percent!)) }) })
    listen('update-downloaded', (info: Info) => {
      if (state.status !== 'downloading' || info.version !== state.availableVersion || !validCandidate(info)) return
      publish({ status: 'ready', progress: 100, error: null })
    })
    listen('error', () => failure('The update could not complete · Check your connection and try again'))
  }
  if (preferences.expectedVersion) {
    if (preferences.expectedVersion !== options.version) {
      failedInstallVersion = preferences.expectedVersion
      publish({ status: state.disabledReason ? 'disabled' : 'error', error: 'The previous update did not apply · Check for updates to retry' })
    }
    preferences = { channel: preferences.channel }
    try { await options.writePreferences(preferences) } catch { failure('Update confirmation could not be saved') }
  }
  const service = {
    getState: snapshot,
    setBlockers(values: string[]) { localBlockers.clear(); values.forEach(value => localBlockers.add(value)); publish() },
    async check(): Promise<UpdateState> {
      if (disabled() || active || state.status === 'ready' || state.status === 'installing') return snapshot()
      active = true
      failedInstallVersion = null
      publish({ status: 'checking', error: null, checkedAt: (options.now?.() ?? new Date()).toISOString(), availableVersion: null, progress: null, releaseNotes: null, releaseUrl: null })
      try { await options.adapter.check(); if (state.status === 'checking') publish({ status: 'idle' }) }
      catch { failure('Could not check for updates · Check your connection and try again') }
      finally { active = false }
      return snapshot()
    },
    async download(): Promise<UpdateState> {
      if (disabled() || active || state.status !== 'available') return snapshot()
      active = true
      publish({ status: 'downloading', progress: 0, error: null })
      try { await options.adapter.download() }
      catch { failure('The update download failed · Check for updates to retry') }
      finally { active = false }
      return snapshot()
    },
    async setChannel(channel: UpdateChannel): Promise<UpdateState> {
      if (!isUpdateChannel(channel)) throw new Error('Choose Stable or Nightly')
      if (disabled() || active || state.status === 'ready' || state.status === 'installing' || channel === state.channel) return snapshot()
      active = true
      try {
        const next = { channel }
        await options.writePreferences(next)
        options.adapter.configure(channel)
        preferences = next
        publish({ channel, status: 'idle', availableVersion: null, progress: null, releaseNotes: null, releaseUrl: null, error: null })
      } catch { failure('Could not save the update track · Try again') }
      finally { active = false }
      if (state.channel === channel && state.status === 'idle') return service.check()
      return snapshot()
    },
    async install(): Promise<UpdateState> {
      if (disabled() || active || state.status !== 'ready' || !state.availableVersion) return snapshot()
      const reasons = blockers()
      if (reasons.length) { publish({ error: 'Finish or save the work listed below before restarting' }); return snapshot() }
      active = true
      const target = state.availableVersion
      publish({ status: 'installing', error: null })
      try {
        await options.writePreferences({ channel: state.channel, expectedVersion: target })
        // Check again after the asynchronous marker write, before workers stop
        if (blockers().length) { await options.writePreferences({ channel: state.channel }); publish({ status: 'ready', error: 'Finish or save the work listed below before restarting' }); return snapshot() }
        await options.beforeInstall()
        options.adapter.install()
      } catch { failure('The update could not be installed · Restart the app and check for updates to retry') }
      finally { active = false }
      return snapshot()
    },
    startPolling() {
      if (disabled() || timers.length) return
      const startup = setTimeout(() => { void service.check() }, 15_000); startup.unref?.(); timers.push(startup)
      const interval = setInterval(() => { void service.check() }, 4 * 60_000); interval.unref?.(); timers.push(interval)
    },
    close() { closed = true; timers.forEach(clearTimeout); listeners.forEach(([event, listener]) => options.adapter.off(event, listener)) },
  }
  return service
}
export type UpdateService = Awaited<ReturnType<typeof createUpdateService>>
