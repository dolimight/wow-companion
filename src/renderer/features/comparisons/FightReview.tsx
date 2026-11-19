import { useMutation } from '@tanstack/react-query'
import { Activity, HeartCrack, ShieldAlert, Swords } from 'lucide-react'
import type { FightSummary } from '../../../shared/comparisons'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/primitives'
import { useAiProvider } from '../ai/ai'
import { ProviderIcon } from '../ai/icons'

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const amount = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${Math.round(value / 1e3)}K` : String(Math.round(value))

/**
 * One fight of a public Warcraft Logs report for this character: the numbers first, then a review from the connected
 * assistant, asked only from its button
 */
export function FightReview({ characterId, url, fightId }: { characterId: string; url: string; fightId: number }) {
  const provider = useAiProvider()
  const load = useMutation({ mutationFn: () => api.fightSummary({ characterId, url, fightId }) })
  const review = useMutation({ mutationFn: (fight: FightSummary) => api.aiAsk({ feature: 'fightReview', input: { characterId, fight } }) })
  const fight = load.data
  if (!fight) return (
    <div className="fight-review-start">
      <Button disabled={load.isPending} onClick={() => load.mutate()}><Activity size={14} aria-hidden="true" />{load.isPending ? 'Reading the fight…' : 'Read this fight'}</Button>
      {load.isError && <p className="error small" role="alert">{errorMessage(load.error)}</p>}
    </div>
  )
  return (
    <Card size="sm" className="fight-review">
      <p className="fight-review-head"><b>{fight.name}{fight.keystoneLevel ? ` +${fight.keystoneLevel}` : ''}</b><span>{fight.kill === true ? 'Kill' : fight.kill === false ? 'Wipe' : 'Outcome unknown'} · {clock(fight.durationMs)}</span></p>
      <div className="fight-review-grid">
        <section aria-label="Damage done">
          <h4><Swords size={13} aria-hidden="true" />{amount(fight.damage.perSecond)} per second</h4>
          <ol>{fight.damage.top.slice(0, 6).map(row => <li key={row.name}><span>{row.name}</span><small>{fight.damage.total ? Math.round(row.total / fight.damage.total * 100) : 0}%</small></li>)}</ol>
        </section>
        <section aria-label="Damage taken">
          <h4><ShieldAlert size={13} aria-hidden="true" />{amount(fight.taken.total)} taken</h4>
          <ol>{fight.taken.top.slice(0, 6).map(row => <li key={row.name}><span>{row.name}</span><small>{amount(row.total)}</small></li>)}</ol>
        </section>
        <section aria-label="Deaths">
          <h4><HeartCrack size={13} aria-hidden="true" />{fight.deaths.length ? `${fight.deaths.length} ${fight.deaths.length === 1 ? 'death' : 'deaths'}` : 'No deaths'}</h4>
          <ol>{fight.deaths.map((death, at) => <li key={at}><span>{death.killingBlow ?? 'Unknown cause'}</span><small>{clock(Math.max(0, death.atMs))}</small></li>)}</ol>
        </section>
      </div>
      {provider && !review.data && <div className="fight-review-ask">
        <Button disabled={review.isPending} onClick={() => review.mutate(fight)}><ProviderIcon id={provider.id} size={14} />{review.isPending ? `Asking ${provider.name}… this can take up to a minute` : `Review with ${provider.name}`}</Button>
        {review.isError && <p className="error small" role="alert">{errorMessage(review.error)}</p>}
      </div>}
      {review.data && <div className="fight-review-findings" aria-live="polite">
        <h4><ProviderIcon id={provider?.id ?? ''} size={13} />{review.data.provider}'s review</h4>
        <ul className="boss-tips">{review.data.value.findings.map(finding => <li key={finding.title}><b>{finding.title}</b> {finding.detail}</li>)}</ul>
        <p className="muted small">{review.data.value.summary} · AI answers can be wrong, so check them against the numbers above</p>
      </div>}
    </Card>
  )
}
