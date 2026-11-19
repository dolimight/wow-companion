import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, RefreshCw, Square } from 'lucide-react'
import type { Activity, Character } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import type { SimulationScenarioId } from '../../../shared/simulation'
import { vaultChoices, type OptimizerLoad, type OptimizerRun } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { specRole } from '../../../shared/roles'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { ItemIcon } from '../items/ItemIcon'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { useGameData } from '../items/items'

const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

/**
 * Which Great Vault choice to take: each one worn with the best of what you own, measured beside skipping the vault.
 * Shown only once the addon has seen this week's choices
 */
export function VaultAdvisor({ character, activity, scenario, load }: { character: Character; activity: Activity; scenario: SimulationScenarioId; load: OptimizerLoad }) {
  const client = useQueryClient()
  const vault = useMemo(() => (character.inventoryObservations ?? []).filter(observation => observation.location === 'vault').flatMap(observation => observation.items), [character.inventoryObservations])
  const run = useQuery({ queryKey: ['optimizer', character.id, 'vault'], queryFn: () => api.optimizerRun(character.id, 'vault'), refetchInterval: query => running(query.state.data) ? 1500 : false, enabled: vault.length > 0 })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity, scenarioId: scenario, mode: 'vault', load }), onSuccess: value => client.setQueryData(['optimizer', character.id, 'vault'], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  // Icons for the choices before a comparison has run come from the game files
  const ids = [...new Set(vault.flatMap(item => item.itemId ? [item.itemId] : []))]
  const gameData = useGameData()
  const details = useQuery({ queryKey: ['vault-item-details', ids], queryFn: () => api.getItems(ids), enabled: gameData.data?.state === 'ready' && ids.length > 0, staleTime: 60_000 })
  const byId = new Map(details.data?.map(item => [item.id, item]))
  const advice = useMemo(() => current?.stage === 'done' ? vaultChoices(current) : null, [current])
  if (!vault.length) return null
  const busy = running(current) || start.isPending
  // SimulationCraft can't model healing, so a healer has no engine run here
  if (specRole(character.specId) === 'healer') return null
  return (
    <Card as="section" className="vault-advisor" aria-labelledby="vault-advisor-title">
      <div className="vault-advisor-head">
        <h3 id="vault-advisor-title"><Gift size={16} aria-hidden="true" />Great Vault</h3>
        {running(current)
          ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
          : <Button disabled={busy} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Gift size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Compare again' : 'Compare my choices'}</Button>}
      </div>
      {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      {current?.stage === 'failed' && <p className="error small" role="alert">{current.failure}</p>}
      {running(current) && <p className="muted small" role="status">Measuring each choice with the best of what you own · {current!.stage === 'confirming' ? 'confirming' : 'screening'}</p>}
      {!advice && !running(current) && <ul className="vault-choices">{vault.map(item => (
        <li key={`${item.itemId}-${item.itemLevel}`}>
          <ItemHoverCard itemId={item.itemId} name={item.name}><span className="best-gear-item" tabIndex={0}><ItemIcon icon={byId.get(item.itemId ?? 0)?.icon} quality={byId.get(item.itemId ?? 0)?.quality} size="small" /><span><b className={`quality-text-${byId.get(item.itemId ?? 0)?.quality ?? 4}`}>{item.name}</b><small>{item.itemLevel} · {gearSlotLabels[item.slot]}</small></span></span></ItemHoverCard>
        </li>
      ))}</ul>}
      {advice && <>
        <p className="vault-advice">{current!.summary}</p>
        <ul className="vault-choices">
          {advice.choices.map(choice => (
            <li key={choice.combo.key} data-take={choice === advice.take ? true : undefined}>
              <ItemHoverCard itemId={choice.candidate.item.itemId} name={choice.candidate.item.name}>
                <span className="best-gear-item" tabIndex={0}>
                  <ItemIcon icon={choice.candidate.icon} quality={choice.candidate.quality ?? undefined} size="small" />
                  <span><b className={`quality-text-${choice.candidate.quality ?? 4}`}>{choice.candidate.item.name}</b><small>{choice.candidate.item.itemLevel} · {gearSlotLabels[choice.candidate.slot]}</small></span>
                </span>
              </ItemHoverCard>
              {choice === advice.take && <Badge tone="green">Take this</Badge>}
              <span className="best-gear-gain" data-sign={choice.over >= 0 ? 'up' : 'down'}>{signed(choice.over)}<small> over skipping</small></span>
            </li>
          ))}
        </ul>
      </>}
    </Card>
  )
}
