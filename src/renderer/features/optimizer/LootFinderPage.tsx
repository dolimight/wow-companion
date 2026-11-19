import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Castle, Cpu, Gem, RefreshCw, Skull, Sparkles, Square } from 'lucide-react'
import type { Activity, Character } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { simulationScenarios, type SimulationScenarioId } from '../../../shared/simulation'
import { lootSources, optimizerLoads, optimizerTrackNames, type OptimizerLoad, type OptimizerRun, type OptimizerTrack } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button, EmptyState } from '../../components/ui/primitives'
import { AppSelect } from '../../components/AppSelect'
import { ItemIcon } from '../items/ItemIcon'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { Forge } from './BestGearPage'
import './best-gear.css'

const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const dps = (value: number) => `+${Math.round(value).toLocaleString('en-US')}`
const scenarioOptions = (Object.entries(simulationScenarios) as Array<[SimulationScenarioId, (typeof simulationScenarios)[SimulationScenarioId]]>).map(([value, scenario]) => ({ value, label: scenario.label }))
const trackOptions = (Object.entries(optimizerTrackNames) as Array<[OptimizerTrack, string]>).map(([value, label]) => ({ value, label: `${label} track` }))
const loadOptions = (Object.entries(optimizerLoads) as Array<[OptimizerLoad, (typeof optimizerLoads)[OptimizerLoad]]>).map(([value, load]) => ({ value, label: `${load.label} · ${load.threads ? `${load.threads} threads` : 'half your threads'}` }))

/**
 * Where to farm: every drop this season that fits the character, measured alone in SimulationCraft at the start of
 * the chosen upgrade track, then each dungeon or raid boss ranked by what its drops add
 */
export function LootFinderPage({ character, activity }: { character: Character; activity: Activity }) {
  const client = useQueryClient()
  const [scenario, setScenario] = useState<SimulationScenarioId>(activity === 'raiding' ? 'patchwerk' : 'dungeon-slice')
  const [track, setTrack] = useState<OptimizerTrack>('hero')
  const [load, setLoad] = useState<OptimizerLoad>('light')
  const run = useQuery({ queryKey: ['optimizer', character.id, 'loot'], queryFn: () => api.optimizerRun(character.id, 'loot'), refetchInterval: query => running(query.state.data) ? 1500 : false })
  const workspace = useQuery({ queryKey: ['simulations', character.id], queryFn: () => api.simulationWorkspace({ characterId: character.id }), staleTime: 60_000 })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity, scenarioId: scenario, mode: 'loot', track, load }), onSuccess: value => client.setQueryData(['optimizer', character.id, 'loot'], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  const busy = running(current) || start.isPending

  if (activity === 'pvp') return <EmptyState icon={Gem} title="The loot finder is for PvE" description="It ranks dungeons and raid bosses, so switch the activity to Mythic+ or Raiding" />
  if (workspace.data && !workspace.data.configured) return <EmptyState icon={Cpu} title="Choose SimulationCraft first" description="The loot finder runs SimulationCraft on this computer. Pick its program in Settings → Integrations, then come back" />

  return (
    <div className="best-gear">
      <Card as="section" className="best-gear-setup" aria-labelledby="loot-finder-title">
        <div className="best-gear-intro">
          <h2 id="loot-finder-title"><Gem size={18} aria-hidden="true" />Where to farm</h2>
          <p>{activity === 'raiding' ? 'Each raid boss' : 'Each dungeon'} ranked by what its drops add for you, every drop measured alone in SimulationCraft</p>
        </div>
        <div className="best-gear-controls">
          <AppSelect aria-label="Upgrade track" value={track} options={trackOptions} disabled={busy} onValueChange={value => setTrack(value as OptimizerTrack)} />
          <AppSelect aria-label="Fight" value={scenario} options={scenarioOptions} disabled={busy} onValueChange={value => setScenario(value as SimulationScenarioId)} />
          <AppSelect aria-label="Processor load" value={load} options={loadOptions} disabled={busy} onValueChange={value => setLoad(value as OptimizerLoad)} />
          {running(current)
            ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
            : <Button variant="primary" disabled={busy} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Run again' : 'Find my loot'}</Button>}
        </div>
        <p className="muted small best-gear-note">Pick the track your drops come on: Champion for lower keys and Normal, Hero for higher keys and Heroic, Myth for the Great Vault and Mythic. Pieces you already measured are reused</p>
        {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      </Card>

      {current && (running(current) || current.stage === 'failed' || current.stage === 'cancelled') && <Forge run={current} />}
      {current?.stage === 'done' && <LootResults run={current} character={character} />}
      {!current && !run.isPending && <EmptyState icon={Gem} title="No search yet" description="Pick the track your drops come on and start. Every drop is measured once; later runs reuse what hasn't changed" />}
    </div>
  )
}

export function LootResults({ run, character }: { run: OptimizerRun; character: Character }) {
  const sources = useMemo(() => lootSources(run), [run])
  const drops = run.pool.length
  return (
    <>
      {run.summary && <Card className="best-gear-summary"><p><Sparkles size={14} aria-hidden="true" />{run.summary}</p></Card>}
      <Card as="section" aria-labelledby="loot-sources">
        <div className="surface-heading"><h2 id="loot-sources">{run.activity === 'raiding' ? 'Bosses' : 'Dungeons'} by what they drop for you</h2><p>{optimizerTrackNames[run.track ?? 'hero']} track{run.trackLevel ? ` · item level ${run.trackLevel}` : ''} · {simulationScenarios[run.scenarioId].label} · each piece over what you wear, counted once per slot</p></div>
        {!sources.length && <p className="muted small">No drop at this level clearly beats what you wear. Try a higher track</p>}
        <ol className="loot-sources">
          {sources.map((source, index) => (
            <li key={source.key}>
              <span className="loot-source-rank">{index + 1}</span>
              <span className="loot-source-name">
                <b>{source.boss ? <><Skull size={14} aria-hidden="true" />{source.boss}</> : <><Castle size={14} aria-hidden="true" />{source.instance}</>}</b>
                <small>{source.boss ? source.instance : `${source.pieces.length} ${source.pieces.length === 1 ? 'upgrade' : 'upgrades'}`}</small>
              </span>
              <span className="loot-source-pieces">
                {source.pieces.slice(0, 4).map(({ candidate, gain }) => {
                  const from = character.gear.find(item => item.slot === candidate.slot)
                  return (
                    <ItemHoverCard key={candidate.key} itemId={candidate.item.itemId} name={candidate.item.name}>
                      <span className="loot-source-piece" tabIndex={0} aria-label={`${candidate.item.name}, ${gearSlotLabels[candidate.slot]}, ${dps(gain)} damage per second${from ? ` over ${from.name}` : ''}`}>
                        <ItemIcon icon={candidate.icon} quality={candidate.quality ?? undefined} size="small" />
                        <small>{dps(gain)}</small>
                      </span>
                    </ItemHoverCard>
                  )
                })}
                {source.pieces.length > 4 && <Badge>+{source.pieces.length - 4}</Badge>}
              </span>
              <span className="best-gear-gain" data-sign="up">{dps(source.total)}<small>{run.baseline ? ` ${(source.total / run.baseline * 100).toFixed(1)}%` : ''}</small></span>
            </li>
          ))}
        </ol>
        <p className="muted small best-gear-meta">{drops} drops measured{run.reused ? ` · ${run.reused} reused from earlier runs` : ''}{run.notes.length ? ` · ${run.notes.length} couldn't run` : ''}</p>
        <p className="muted small dungeon-note">Modeled damage per second in SimulationCraft. A source's total adds its best piece in each slot, so wearing them all at once can be worth a little less</p>
      </Card>
    </>
  )
}
