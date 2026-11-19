import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gem, RefreshCw, Square, WandSparkles } from 'lucide-react'
import type { Activity, Character, GearSlot } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import type { SimulationScenarioId } from '../../../shared/simulation'
import { enhancementAdvice, type OptimizerLoad, type OptimizerRun } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { ItemIcon } from '../items/ItemIcon'
import { useGameData } from '../items/items'

const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('en-US')}`
const plain = (name: string) => name.toLowerCase().replace(/^enchant\s+[^-–]+[-–]\s*/, '').trim()

/** The top players' enchants for each slot you wear and their gems in your sockets, tried on your gear */
export function EnchantsCheck({ character, activity, scenario, load }: { character: Character; activity: Activity; scenario: SimulationScenarioId; load: OptimizerLoad }) {
  const client = useQueryClient()
  const run = useQuery({ queryKey: ['optimizer', character.id, 'enchants'], queryFn: () => api.optimizerRun(character.id, 'enchants'), refetchInterval: query => running(query.state.data) ? 1500 : false })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity, scenarioId: scenario, mode: 'enchants', load }), onSuccess: value => client.setQueryData(['optimizer', character.id, 'enchants'], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  const advice = useMemo(() => current?.stage === 'done' ? enhancementAdvice(current) : [], [current])
  // Icons come from the game files' enchant scrolls and gems, matched by name
  const slots = [...new Set(advice.flatMap(option => option.combo.enhancement?.slot ? [option.combo.enhancement.slot] : []))] as GearSlot[]
  const gameData = useGameData()
  const icons = useQuery({
    queryKey: ['enhancement-icons', slots],
    queryFn: async () => {
      const lists = await Promise.all([...slots.map(slot => api.enhancements({ kind: 'enchant', slot })), api.enhancements({ kind: 'gem', slot: null })])
      return new Map(lists.flat().map(option => [plain(option.name), option]))
    },
    enabled: gameData.data?.state === 'ready' && advice.length > 0, staleTime: 3_600_000,
  })
  const busy = running(current) || start.isPending
  return (
    <Card as="section" className="vault-advisor" aria-labelledby="enchants-check-title">
      <div className="vault-advisor-head">
        <div>
          <h3 id="enchants-check-title"><WandSparkles size={16} aria-hidden="true" />Enchants and gems</h3>
          <p className="muted small">The top players' enchants for each slot and gems for your sockets, tried on your gear</p>
        </div>
        {running(current)
          ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
          : <Button disabled={busy} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Gem size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Check again' : 'Check enchants and gems'}</Button>}
      </div>
      {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      {current?.stage === 'failed' && <p className="error small" role="alert">{current.failure}</p>}
      {running(current) && <p className="muted small" role="status">Trying {current!.combos.length || 'the top'} enchants and gems on your gear</p>}
      {current?.stage === 'done' && <>
        {current.summary && <p className="vault-advice">{current.summary}</p>}
        <ol className="vault-choices">
          {advice.map(option => {
            const enhancement = option.combo.enhancement!
            const found = icons.data?.get(plain(option.combo.label))
            return (
              <li key={option.combo.key} data-take={option.clear && option.gain > 0 ? true : undefined}>
                <span className="best-gear-item">
                  <ItemIcon icon={found?.icon} quality={found?.quality} size="small" fallback={enhancement.kind === 'gem' ? <Gem size={14} aria-hidden="true" /> : <WandSparkles size={14} aria-hidden="true" />} />
                  <span><b>{option.combo.label}</b><small>{enhancement.slot ? `${gearSlotLabels[enhancement.slot]} · instead of ${enhancement.current ?? 'no enchant'}` : 'Every socket'} · {option.combo.why}</small></span>
                </span>
                {!option.clear && <Badge>Within noise</Badge>}
                <span className="best-gear-gain" data-sign={option.gain >= 0 ? 'up' : 'down'}>{signed(option.gain)}</span>
              </li>
            )
          })}
        </ol>
        {current.notes.length > 0 && <p className="muted small">{current.notes.length} couldn't be described to the engine, such as an enchant the game files don't name the same way</p>}
      </>}
    </Card>
  )
}
