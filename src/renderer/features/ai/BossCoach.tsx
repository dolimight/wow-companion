import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { strategyFor, whyItMatters, type JournalBoss, type JournalRole, type StrategyNotes } from '../../../shared/dungeons'
import type { AiAnswer, BossCoachInput, BossCoachOutput } from '../../../shared/ai'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/primitives'
import { useAiProvider } from './ai'
import { ProviderIcon } from './icons'

type CoachAnswer = AiAnswer<BossCoachOutput>

/** The strategy lines and role-relevant mechanics already on the page, which the answer builds on */
function pageNotes(boss: JournalBoss, plan: StrategyNotes | undefined, role: JournalRole, mythic: boolean) {
  const { positioning, everyone, mine } = strategyFor(plan, role)
  const abilities = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role)).map(ability => `${ability.name}: ${ability.text.replace(/\s+/g, ' ').slice(0, 300)}`)
  return [...mine, ...positioning, ...everyone, ...(mythic ? plan?.mythic ?? [] : []), ...boss.tips.filter(tip => tip.role === role).map(tip => tip.text.replace(/\s+/g, ' ')), ...abilities].map(line => line.slice(0, 600)).slice(0, 60)
}

/**
 * Tips for the player's own spec on this boss from their connected assistant. The assistant is called only from the
 * button: a press is a mutation, never a query, so focus, remounts, reconnects, and new bosses or roles can't ask on
 * their own. An answer is kept in the query cache by boss and role, so stepping back to a boss shows it again.
 * Hidden while no assistant is connected
 */
export function BossCoach({ character, instance, difficulty, boss, role, plan, mythic = false }: { character: Character; instance: string; difficulty: string; boss: JournalBoss; role: JournalRole; plan: StrategyNotes | undefined; mythic?: boolean }) {
  const provider = useAiProvider()
  const client = useQueryClient()
  const input: BossCoachInput = { characterId: character.id, instance, difficulty, boss: boss.name, role, notes: pageNotes(boss, plan, role, mythic) }
  const key = ['ai', 'bossCoach', provider?.id, input]
  // Reads the cache only: with no query function and enabled off, this never calls the assistant
  const saved = useQuery<CoachAnswer>({ queryKey: key, queryFn: skipToken, staleTime: Infinity, gcTime: 60 * 60_000 })
  const ask = useMutation({ mutationFn: (question: BossCoachInput) => api.aiAsk({ feature: 'bossCoach', input: question }), onSuccess: (value, question) => client.setQueryData(['ai', 'bossCoach', provider?.id, question], value) })
  const asking = ask.isPending && JSON.stringify(ask.variables) === JSON.stringify(input)
  const failed = ask.isError && JSON.stringify(ask.variables) === JSON.stringify(input)
  if (!provider) return null
  const spec = character.specName && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character.className
  const answer = saved.data
  if (!answer && !asking && !failed) return <Button className="ai-coach-ask" onClick={() => ask.mutate(input)}><ProviderIcon id={provider.id} size={14} />Ask {provider.name} for {spec} tips</Button>
  return (
    <Card size="sm" className="ai-coach" aria-live="polite">
      <h4><ProviderIcon id={provider.id} size={14} />{spec} tips from {provider.name}</h4>
      {asking && !answer ? <p className="muted small" role="status">Asking {provider.name}… this can take up to a minute</p>
        : failed && !answer ? <div className="ai-coach-error"><p className="muted small" role="alert">{errorMessage(ask.error)}</p><Button variant="quiet" onClick={() => ask.mutate(input)}><RefreshCw size={13} aria-hidden="true" />Try again</Button></div>
          : answer && <>
            <ul className="boss-tips">{answer.value.tips.map((tip, at) => <li key={at}>{tip}</li>)}</ul>
            {answer.value.cooldowns.length > 0 && <dl className="ai-coach-cooldowns">{answer.value.cooldowns.map((entry, at) => <div key={at}><dt>{entry.ability}</dt><dd>{entry.when}</dd></div>)}</dl>}
            <p className="muted small">Written by {provider.name} for this fight in {Math.max(1, Math.round(answer.durationMs / 1000))} s · AI answers can be wrong, so check them against the strategy above</p>
          </>}
    </Card>
  )
}
