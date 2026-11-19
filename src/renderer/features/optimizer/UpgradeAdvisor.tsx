import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle, Cpu, RefreshCw, Square } from 'lucide-react'
import type { Activity, Character } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { upgradeAdvice, type OptimizerRun } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { specRole } from '../../../shared/roles'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { ItemIcon } from '../items/ItemIcon'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { CurrencyLabel } from '../../components/CurrencyLabel'
import './best-gear.css'

const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

/**
 * What to upgrade first: each equipped piece measured one crest rank higher in SimulationCraft, ranked by damage per
 * crest, with the crests the addon saw spent on the best value first
 */
export function UpgradeAdvisor({ character, activity }: { character: Character; activity: Activity }) {
  const client = useQueryClient()
  const run = useQuery({ queryKey: ['optimizer', character.id, 'upgrades'], queryFn: () => api.optimizerRun(character.id, 'upgrades'), refetchInterval: query => running(query.state.data) ? 1500 : false })
  const workspace = useQuery({ queryKey: ['simulations', character.id], queryFn: () => api.simulationWorkspace({ characterId: character.id }), staleTime: 60_000 })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity: activity === 'pvp' ? 'mythicPlus' : activity, scenarioId: activity === 'raiding' ? 'patchwerk' : 'dungeon-slice', mode: 'upgrades' }), onSuccess: value => client.setQueryData(['optimizer', character.id, 'upgrades'], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  const currencies = character.progressionResources?.currencies ?? null
  const advice = useMemo(() => current?.stage === 'done' ? upgradeAdvice(current, currencies) : [], [current, currencies])
  const busy = running(current) || start.isPending
  if (workspace.data && !workspace.data.configured) return null
  // SimulationCraft can't model healing, so a healer has no engine run here
  if (specRole(character.specId) === 'healer') return null
  return (
    <Card as="section" className="upgrade-advisor" aria-labelledby="upgrade-advisor-title">
      <div className="vault-advisor-head">
        <div>
          <h3 id="upgrade-advisor-title"><ArrowUpCircle size={16} aria-hidden="true" />What to upgrade first</h3>
          <p className="muted small">Each piece you wear, one crest rank higher, measured in SimulationCraft · ranked by damage per crest</p>
        </div>
        {running(current)
          ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
          : <Button disabled={busy} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Cpu size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Measure again' : 'Measure upgrades'}</Button>}
      </div>
      {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      {current?.stage === 'failed' && <p className="error small" role="alert">{current.failure}</p>}
      {running(current) && <p className="muted small" role="status">Measuring {current!.pool.length || 'each'} upgrades on a light load{current!.reused ? ` · ${current!.reused} already measured` : ''}</p>}
      {current?.stage === 'done' && <>
        {current.summary && <p className="vault-advice">{current.summary}</p>}
        <ol className="vault-choices">
          {advice.map(entry => {
            const upgrade = entry.candidate.upgrade!
            return (
              <li key={entry.candidate.key} data-take={entry === advice[0] && entry.clear ? true : undefined}>
                <ItemHoverCard itemId={entry.candidate.item.itemId} name={entry.candidate.item.name}>
                  <span className="best-gear-item" tabIndex={0}>
                    <ItemIcon icon={entry.candidate.icon} quality={entry.candidate.quality ?? undefined} size="small" />
                    <span><b className={`quality-text-${entry.candidate.quality ?? 4}`}>{entry.candidate.item.name}</b><small>{gearSlotLabels[entry.candidate.slot]} · {upgrade.track} {upgrade.fromLevel} → {upgrade.toLevel} · {upgrade.crestId ? <CurrencyLabel id={upgrade.crestId} amount={upgrade.crests} /> : 'no crest'}{upgrade.gold ? ` · ${upgrade.gold.toLocaleString()} gold` : ''}</small></span>
                  </span>
                </ItemHoverCard>
                {entry.affordable != null && entry.clear && <Badge tone={entry.affordable ? 'green' : 'neutral'}>{entry.affordable ? 'Affordable now' : 'Needs more'}</Badge>}
                {!entry.clear && <Badge>Within noise</Badge>}
                <span className="best-gear-gain" data-sign={entry.gain >= 0 ? 'up' : 'down'}>{signed(entry.gain)}<small>{upgrade.crests && entry.clear ? ` ${Math.round(entry.perCrest).toLocaleString('en-US')} per crest` : ''}</small></span>
              </li>
            )
          })}
        </ol>
      </>}
    </Card>
  )
}
