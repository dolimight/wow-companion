import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, RefreshCw, Sparkles } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { strategyFor, whyItMatters, type JournalBoss, type JournalRole, type StrategyNotes } from '../../../shared/dungeons'
import type { BossCoachInput } from '../../../shared/ai'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/primitives'
import { useAiProvider } from './ai'

/** The strategy lines and role-relevant mechanics already on the page, which the answer builds on */
function pageNotes(boss: JournalBoss, plan: StrategyNotes | undefined, role: JournalRole, mythic: boolean) {
  const { positioning, everyone, mine } = strategyFor(plan, role)
  const abilities = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role)).map(ability => `${ability.name}: ${ability.text.replace(/\s+/g, ' ').slice(0, 300)}`)
  return [...mine, ...positioning, ...everyone, ...(mythic ? plan?.mythic ?? [] : []), ...boss.tips.filter(tip => tip.role === role).map(tip => tip.text.replace(/\s+/g, ' ')), ...abilities].map(line => line.slice(0, 600)).slice(0, 60)
}

/**
 * Tips for the player's own spec on this boss from their connected assistant, asked only when they press the button.
 * Hidden while no assistant is connected
 */
export function BossCoach({ character, instance, difficulty, boss, role, plan, mythic = false }: { character: Character; instance: string; difficulty: string; boss: JournalBoss; role: JournalRole; plan: StrategyNotes | undefined; mythic?: boolean }) {
  const provider = useAiProvider()
  const [asked, setAsked] = useState(false)
  const input: BossCoachInput = { characterId: character.id, instance, difficulty, boss: boss.name, role, notes: pageNotes(boss, plan, role, mythic) }
  const answer = useQuery({ queryKey: ['ai', 'bossCoach', provider?.id, input], queryFn: () => api.aiAsk({ feature: 'bossCoach', input }), enabled: asked && !!provider, staleTime: Infinity, gcTime: 60 * 60_000, retry: false })
  if (!provider) return null
  const spec = character.specName && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character.className
  if (!asked && !answer.data) return <Button className="ai-coach-ask" onClick={() => setAsked(true)}><Sparkles size={14} aria-hidden="true" />Ask {provider.name} for {spec} tips</Button>
  return (
    <Card size="sm" className="ai-coach" aria-live="polite">
      <h4><Bot size={14} aria-hidden="true" />{spec} tips from {provider.name}</h4>
      {answer.isFetching && !answer.data ? <p className="muted small" role="status">Asking {provider.name}… this can take up to a minute</p>
        : answer.isError ? <div className="ai-coach-error"><p className="muted small" role="alert">{errorMessage(answer.error)}</p><Button variant="quiet" onClick={() => void answer.refetch()}><RefreshCw size={13} aria-hidden="true" />Try again</Button></div>
          : answer.data && <>
            <ul className="boss-tips">{answer.data.value.tips.map((tip, at) => <li key={at}>{tip}</li>)}</ul>
            {answer.data.value.cooldowns.length > 0 && <dl className="ai-coach-cooldowns">{answer.data.value.cooldowns.map((entry, at) => <div key={at}><dt>{entry.ability}</dt><dd>{entry.when}</dd></div>)}</dl>}
            <p className="muted small">Written by {provider.name} for this fight in {Math.max(1, Math.round(answer.data.durationMs / 1000))} s · AI answers can be wrong, so check them against the strategy above</p>
          </>}
    </Card>
  )
}
