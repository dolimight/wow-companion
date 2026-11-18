import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleOff, RefreshCw, X } from 'lucide-react'
import type { AiProviderInfo } from '../../../shared/ai'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { AppSelect } from '../../components/AppSelect'
import { ProviderIcon } from './icons'
import './ai.css'

/** Which assistant CLIs are installed and signed in, and the one the player picked */
export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: () => api.aiStatus(), staleTime: 60_000, retry: false })
}

/** The connected provider, when AI help is on and its CLI is signed in */
export function useAiProvider(): AiProviderInfo | null {
  const status = useAiStatus()
  const selected = status.data?.providers.find(provider => provider.id === status.data?.selected)
  return selected?.installed && selected.signedIn ? selected : null
}

function ProviderState({ provider }: { provider: AiProviderInfo }) {
  if (!provider.installed) return <Badge><X size={11} aria-hidden="true" />Not found</Badge>
  if (!provider.signedIn) return <Badge tone="amber">Not signed in</Badge>
  return <Badge tone="green"><Check size={11} aria-hidden="true" />Signed in</Badge>
}

/**
 * Settings: connect an assistant CLI the player already uses, so AI help runs on their own plan. Nothing here is needed
 * for the rest of the app
 */
export function AiSettings() {
  const status = useAiStatus()
  const client = useQueryClient()
  const [checking, setChecking] = useState(false)
  const choose = useMutation({
    mutationFn: (provider: string | null) => api.saveSettings({ aiProvider: provider }),
    onSuccess: (_settings, provider) => { void client.invalidateQueries({ queryKey: ['ai-status'] }); void client.invalidateQueries({ queryKey: ['settings'] }); notify(provider ? 'AI assistant connected' : 'AI help turned off') },
    onError: error => notify(errorMessage(error)),
  })
  const check = async () => {
    setChecking(true)
    try { client.setQueryData(['ai-status'], await api.aiStatus(true)) } catch (error) { notify(errorMessage(error)) } finally { setChecking(false) }
  }
  return (
    <section className="settings-section" aria-labelledby="ai-heading">
      <h2 id="ai-heading">AI assistants</h2>
      <p>Optional help from the Codex or Claude command-line tool you already use, on your own plan. Everything else in the app works without one</p>
      <Card className="settings-section-body">
        {status.isPending ? <p className="muted small ai-settings-status" role="status">Looking for assistants…</p>
          : status.isError ? <p className="muted small ai-settings-status" role="alert">{errorMessage(status.error)}</p>
            : <>
              <div className="setting-row">
                <div>
                  <h3>Assistant</h3>
                  <p>Questions go to this tool and use the plan it's signed in with. Only a signed-in tool can be chosen</p>
                </div>
                <AppSelect className="ai-select" aria-label="AI assistant" value={status.data.selected ?? 'off'} disabled={choose.isPending}
                  onValueChange={value => choose.mutate(value === 'off' ? null : value)}
                  options={[
                    { value: 'off', label: 'Off', icon: <CircleOff size={16} aria-hidden="true" /> },
                    ...status.data.providers.map(provider => ({ value: provider.id, label: provider.name, icon: <ProviderIcon id={provider.id} />, disabled: !provider.installed || !provider.signedIn })),
                  ]} />
              </div>
              {status.data.providers.map(provider => (
                <div key={provider.id} className="setting-row ai-provider">
                  <span className="ai-provider-icon"><ProviderIcon id={provider.id} size={20} /></span>
                  <div>
                    <h3>{provider.name}{provider.version && <small>{provider.version}</small>}<ProviderState provider={provider} /></h3>
                    <p>{provider.description}</p>
                    {provider.detail && <p className="muted small">{provider.detail}</p>}
                  </div>
                </div>
              ))}
            </>}
        <div className="setting-row">
          <div>
            <h3>What gets sent</h3>
            <p>Only what a question needs. Boss tips send the boss, your class, spec, and role, and the strategy already on the page. Best gear sends your gear and each candidate piece with its tested gain. The assistant runs with its tools off in an empty folder, and each question counts toward your plan's limits</p>
          </div>
          <Button disabled={checking} onClick={() => void check()}><RefreshCw size={14} aria-hidden="true" />{checking ? 'Checking…' : 'Check again'}</Button>
        </div>
      </Card>
    </section>
  )
}
