import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RefreshCw, SquareTerminal, X } from 'lucide-react'
import type { AiProviderInfo } from '../../../shared/ai'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { Toggle } from '../../components/ui/toggle'
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
            : status.data.providers.map(provider => {
              const selected = status.data.selected === provider.id
              return (
                <div key={provider.id} className="setting-row ai-provider">
                  <span className="ai-provider-icon"><SquareTerminal size={18} aria-hidden="true" /></span>
                  <div>
                    <h3>{provider.name}{provider.version && <small> {provider.version}</small>} <ProviderState provider={provider} /></h3>
                    <p>{provider.description}</p>
                    {provider.detail && <p className="muted small">{provider.detail}</p>}
                  </div>
                  <Toggle type="button" variant="outline" className="workspace-toggle" aria-label={`Use ${provider.name}`}
                    pressed={selected} disabled={choose.isPending || (!selected && !provider.signedIn)}
                    onPressedChange={pressed => choose.mutate(pressed ? provider.id : null)}>
                    {selected ? 'In use' : 'Use'}
                  </Toggle>
                </div>
              )
            })}
        <div className="setting-row">
          <div>
            <h3>What gets sent</h3>
            <p>Only what a question needs: for boss tips, the boss, your class, spec, and role, and the strategy already on the page. The assistant runs with its tools off in an empty folder, and each question counts toward your plan's limits</p>
          </div>
          <Button disabled={checking} onClick={() => void check()}><RefreshCw size={14} aria-hidden="true" />{checking ? 'Checking…' : 'Check again'}</Button>
        </div>
      </Card>
    </section>
  )
}
