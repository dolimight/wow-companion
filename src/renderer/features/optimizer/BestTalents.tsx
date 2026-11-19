import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw, Sparkles, Square, Users } from 'lucide-react'
import type { Activity, Character } from '../../../shared/domain'
import type { SimulationScenarioId } from '../../../shared/simulation'
import { talentBuilds, type OptimizerLoad, type OptimizerRun } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { specRole } from '../../../shared/roles'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'

const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('en-US')}`

/** The top players' most used builds run on your own gear, so you can see whether their talents beat yours */
export function BestTalents({ character, activity, scenario, load }: { character: Character; activity: Activity; scenario: SimulationScenarioId; load: OptimizerLoad }) {
  const client = useQueryClient()
  const run = useQuery({ queryKey: ['optimizer', character.id, 'talents'], queryFn: () => api.optimizerRun(character.id, 'talents'), refetchInterval: query => running(query.state.data) ? 1500 : false })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity, scenarioId: scenario, mode: 'talents', load }), onSuccess: value => client.setQueryData(['optimizer', character.id, 'talents'], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  const builds = useMemo(() => current?.stage === 'done' ? talentBuilds(current) : [], [current])
  const busy = running(current) || start.isPending
  const copy = (loadout: string) => void api.copyText(loadout).then(() => notify('Talent build copied · import it in game from the talent screen'), () => notify('Could not copy the build'))
  // SimulationCraft can't model healing, so a healer has no engine run here
  if (specRole(character.specId) === 'healer') return null
  return (
    <Card as="section" className="vault-advisor" aria-labelledby="best-talents-title">
      <div className="vault-advisor-head">
        <div>
          <h3 id="best-talents-title"><Sparkles size={16} aria-hidden="true" />Best talents</h3>
          <p className="muted small">The top players' most used builds, run on your gear{character.talents?.loadout ? ' against yours' : ''}</p>
        </div>
        {running(current)
          ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
          : <Button disabled={busy || !character.talents?.loadout} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Users size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Compare again' : 'Compare top builds'}</Button>}
      </div>
      {!character.talents?.loadout && <p className="muted small">Your own build isn't known yet · sync with the addon or refresh the character first</p>}
      {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      {current?.stage === 'failed' && <p className="error small" role="alert">{current.failure}</p>}
      {running(current) && <p className="muted small" role="status">Running {current!.combos.length || 'the top'} builds on your gear</p>}
      {current?.stage === 'done' && <>
        {current.summary && <p className="vault-advice">{current.summary}</p>}
        <ol className="vault-choices">
          {builds.map((build, index) => (
            <li key={build.combo.key} data-take={index === 0 && build.clear && build.gain > 0 ? true : undefined}>
              <span className="talent-build"><b>{build.combo.label}</b>{build.combo.why && <small>Such as {build.combo.why}</small>}</span>
              <span className="talent-build-actions">
                {!build.clear && <Badge>Within noise</Badge>}
                <Button variant="icon" aria-label={`Copy the build ${build.combo.label.toLowerCase()}`} onClick={() => copy(build.combo.talents!)}><Copy size={14} aria-hidden="true" /></Button>
              </span>
              <span className="best-gear-gain" data-sign={build.gain >= 0 ? 'up' : 'down'}>{signed(build.gain)}<small> over yours</small></span>
            </li>
          ))}
        </ol>
      </>}
    </Card>
  )
}
