import { useEffect, useState } from 'react'
import { AlertCircle, Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import type { UpdateState } from '../../../shared/updates'
import { Button } from '../../components/ui/primitives'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '../../components/ui/popover'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { syncUpdateBlockers } from '../../lib/update-safety'
import './updates.css'

function useUpdateState() {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    const bridge = window.companion
    if (!bridge) return
    let active = true
    void bridge.updateState().then(value => { if (active) setState(value) }).catch(() => undefined)
    const unsubscribe = bridge.onUpdateState(value => { if (active) setState(value) })
    return () => { active = false; unsubscribe() }
  }, [])
  return [state, setState] as const
}

const waiting = ['available', 'downloading', 'ready']

function summary(state: UpdateState | null) {
  if (!state) return 'Check for application updates'
  if (state.status === 'available') return `Update available · ${state.availableVersion ?? ''}`.trim()
  if (state.status === 'downloading') return 'Downloading update'
  if (state.status === 'ready') return 'Update ready · Restart to install'
  if (state.status === 'error') return 'Update check failed'
  return 'Check for application updates'
}

/** Sidebar footer control: always visible, opens one panel that covers every update state */
export function UpdateButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [state, setState] = useUpdateState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bridge = window.companion
  const run = async (action: () => Promise<UpdateState>) => {
    setBusy(true); setError(null)
    try { setState(await action()) } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  const check = () => run(() => bridge!.checkForUpdates())
  const status = state?.status
  const working = busy || status === 'checking' || status === 'downloading' || status === 'installing'
  const label = summary(state)
  const message = error ?? state?.error
  return <Popover onOpenChange={open => { if (open && bridge && (status === 'idle' || status === 'error') && !working) void check() }}>
    <PopoverTrigger render={<button type="button" className="footer-icon update-button" aria-label={label} title={label} />}>
      {working ? <RefreshCw className="spin" /> : status === 'error' ? <AlertCircle /> : <Download />}
      {status && waiting.includes(status) && <span className="update-badge" aria-hidden="true" />}
    </PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={10} className="update-popover">
      <PopoverHeader>
        <PopoverTitle>{!bridge ? 'Updates are available in the desktop app' : !state ? 'Checking update support' : status === 'disabled' ? 'Updates unavailable' : status === 'checking' ? 'Checking for updates' : status === 'available' ? 'Update available' : status === 'downloading' ? 'Downloading update' : status === 'ready' ? 'Ready to install' : status === 'installing' ? 'Restarting WOW Companion' : status === 'error' ? 'Could not check for updates' : 'WOW Companion is up to date'}</PopoverTitle>
        <PopoverDescription>
          {!state ? '' : status === 'disabled' ? state.disabledReason : status === 'available' ? `${state.availableVersion} is ready to download` : status === 'downloading' ? (state.progress == null ? 'Preparing download' : `${Math.round(state.progress)}% downloaded`) : status === 'ready' ? 'WOW Companion restarts to finish the update' : status === 'idle' || status === 'checking' ? `Version ${state.currentVersion} on the ${state.channel === 'nightly' ? 'Nightly' : 'Stable'} track` : null}
        </PopoverDescription>
      </PopoverHeader>
      {status === 'downloading' && <progress className="update-popover-progress" max={100} value={state?.progress ?? undefined} aria-label="Update download progress" />}
      {message && status !== 'disabled' && <p className="update-popover-note error" role="alert">{message}</p>}
      {status === 'ready' && !!state?.blockers.length && <ul className="update-popover-note" aria-label="Before restarting">{state.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {state?.checkedAt && status === 'idle' && <p className="update-popover-note">Last checked {new Date(state.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>}
      <div className="update-popover-actions">
        {status === 'available' && <Button variant="primary" disabled={working} onClick={() => void run(() => bridge!.downloadUpdate())}><Download size={14} />Download update</Button>}
        {status === 'ready' && <Button variant="primary" disabled={working || !!state?.blockers.length} onClick={() => void run(async () => { await syncUpdateBlockers(); return bridge!.installUpdate() })}><RotateCw size={14} />Restart and update</Button>}
        {(status === 'idle' || status === 'error') && <Button disabled={working} onClick={() => void check()}><RefreshCw size={14} />{status === 'error' ? 'Try again' : 'Check for updates'}</Button>}
        {state?.releaseUrl && status === 'available' && <Button variant="quiet" onClick={() => void api.openExternal(state.releaseUrl!).catch(cause => setError(errorMessage(cause)))}>What’s new<ExternalLink size={13} /></Button>}
        <Button variant="quiet" onClick={onOpenSettings}>Update settings</Button>
      </div>
    </PopoverContent>
  </Popover>
}
