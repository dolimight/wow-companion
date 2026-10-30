import { useEffect, useState } from 'react'
import { ArrowUpCircle, Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import type { UpdateChannel, UpdateState } from '../../../shared/updates'
import { AppSelect } from '../../components/AppSelect'
import { Badge, Button, Field } from '../../components/ui/primitives'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { syncUpdateBlockers } from '../../lib/update-safety'
import './updates.css'

const labels: Record<UpdateState['status'], string> = {
  disabled: 'Updates unavailable', idle: 'Ready to check', checking: 'Checking for updates…',
  available: 'Update available', downloading: 'Downloading update…', ready: 'Ready to restart',
  installing: 'Restarting WOW Companion…', error: 'Update needs attention',
}

export function UpdateIndicator({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    const bridge = window.companion
    if (!bridge) return
    let active = true
    void bridge.updateState().then(value => { if (active) setState(value) }).catch(() => undefined)
    const unsubscribe = bridge.onUpdateState(value => { if (active) setState(value) })
    return () => { active = false; unsubscribe() }
  }, [])
  if (!state || !['available', 'downloading', 'ready'].includes(state.status)) return null
  const title = state.status === 'ready' ? 'Update ready to restart · Open Settings' : state.status === 'downloading' ? 'Update downloading · Open Settings' : 'Update available · Open Settings'
  return <button className="footer-icon update-available" aria-label={title} title={title} onClick={onOpen}><ArrowUpCircle size={18} /></button>
}

export function UpdateSettings() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [later, setLater] = useState(false)
  useEffect(() => {
    const bridge = window.companion
    if (!bridge) return
    let active = true
    void bridge.updateState().then(value => { if (active) setState(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    const unsubscribe = bridge.onUpdateState(value => { if (active) setState(value) })
    return () => { active = false; unsubscribe() }
  }, [])
  const run = async (action: () => Promise<UpdateState>) => {
    setBusy(true); setError(null)
    try { setState(await action()) } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  const locked = busy || state?.status === 'checking' || state?.status === 'downloading' || state?.status === 'installing'
  const disabled = !state || state.status === 'disabled'
  const notes = state?.releaseNotes?.split(/<details[\s>]/i)[0]?.trim()
  return <section className="settings-section" aria-labelledby="updates-heading">
    <h2 id="updates-heading">Updates &amp; About</h2>
    <p>Stable releases for everyday use, Nightly for the latest changes</p>
    <div className="settings-section-body surface updates-settings">
      <div className="updates-identity"><ArrowUpCircle size={21} aria-hidden="true" /><div><h3>WOW Companion</h3><p>{state ? `Version ${state.currentVersion}` : window.companion ? 'Loading installed version…' : 'Updates are available in the desktop app'}</p></div>{state && <Badge>{state.currentVersion.includes('-nightly.') ? 'Nightly build' : 'Stable build'}</Badge>}</div>
      <Field label="Update track"><AppSelect label="Update track" value={state?.channel ?? 'stable'} options={[{ value: 'stable', label: 'Stable' }, { value: 'nightly', label: 'Nightly' }]} disabled={disabled || locked || state?.status === 'ready'} onValueChange={channel => { setLater(false); void run(() => window.companion!.setUpdateChannel(channel as UpdateChannel)) }} /></Field>
      {state?.status === 'ready' && <p className="muted">Install the downloaded update before changing tracks</p>}
      <p className="muted">Nightly builds may contain unfinished changes · Returning to an older Stable build is blocked to protect your local data</p>
      <div className="updates-status" role="status" aria-live="polite"><strong>{state ? state.status === 'idle' && state.checkedAt ? 'No newer release on this track' : labels[state.status] : 'Checking update support…'}</strong>{state?.availableVersion && <span>{state.availableVersion}</span>}{state?.checkedAt && <small>Last checked {new Date(state.checkedAt).toLocaleString()}</small>}</div>
      {state?.status === 'downloading' && <div className="updates-progress"><progress max={100} value={state.progress ?? undefined} aria-label="Update download progress" /><span>{state.progress == null ? 'Preparing download…' : `${Math.round(state.progress)}%`}</span></div>}
      {state?.disabledReason && <p className="muted">{state.disabledReason}</p>}
      {(error || state?.error) && <p className="error" role="alert">{error ?? state?.error}</p>}
      {!!state?.blockers.length && <div className="updates-blockers"><strong>Before restarting</strong><ul>{state.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
      {later && state?.status === 'ready' && <p className="muted">The update is downloaded · Restart here when you are ready</p>}
      <div className="updates-actions">
        <Button disabled={disabled || locked} onClick={() => void run(() => window.companion!.checkForUpdates())}><RefreshCw size={14} />Check for updates</Button>
        {state?.status === 'available' && <Button variant="primary" disabled={locked} onClick={() => { setLater(false); void run(() => window.companion!.downloadUpdate()) }}><Download size={14} />Download update</Button>}
        {state?.status === 'ready' && <><Button variant="primary" disabled={locked || !!state.blockers.length} onClick={() => void run(async () => { await syncUpdateBlockers(); return window.companion!.installUpdate() })}><RotateCw size={14} />Restart and update</Button><Button variant="quiet" disabled={locked} onClick={() => setLater(true)}>Later</Button></>}
        <Button variant="quiet" onClick={() => void api.openExternal('https://github.com/dolimight/wow-companion/releases').catch(cause => setError(errorMessage(cause)))}><ExternalLink size={14} />Release history</Button>
      </div>
      {notes && <details className="updates-notes"><summary>What’s new{state?.availableVersion ? ` in ${state.availableVersion}` : ''}</summary><div>{notes.split('\n').map((line, index) => /^##\s/.test(line) ? <h4 key={index}>{line.replace(/^##\s+/, '')}</h4> : <p key={index}>{line.replace(/^[-*]\s+/, '• ').replace(/\*\*/g, '') || '\u00a0'}</p>)}</div>{state?.releaseUrl && <Button variant="quiet" onClick={() => void api.openExternal(state.releaseUrl!).catch(cause => setError(errorMessage(cause)))}>Read full release notes<ExternalLink size={13} /></Button>}</details>}
    </div>
  </section>
}
