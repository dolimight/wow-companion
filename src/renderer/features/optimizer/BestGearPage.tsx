import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Cpu, RefreshCw, Sparkles, Square, Target, TriangleAlert, WandSparkles } from 'lucide-react'
import type { Activity, Character, GearSlot } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { simulationScenarios, type SimulationScenarioId } from '../../../shared/simulation'
import { gearChanged, isOwned, optimizerLoads, upgradesToChase, optimizerStages, type OptimizerLoad, originLabels, type OptimizerCandidate, type OptimizerCombo, type OptimizerRun } from '../../../shared/optimizer'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button, EmptyState } from '../../components/ui/primitives'
import { Toggle } from '../../components/ui/toggle'
import { AppSelect } from '../../components/AppSelect'
import { ItemIcon } from '../items/ItemIcon'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { useAiProvider } from '../ai/ai'
import { ProviderIcon } from '../ai/icons'
import './best-gear.css'

const slotOrder: GearSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainHand', 'offHand']
const stageLabels: Record<(typeof optimizerStages)[number], string> = { gathering: 'Gathering gear', screening: 'Testing each piece', choosing: 'Choosing sets', confirming: 'Confirming the best', done: 'Done' }
const running = (run: OptimizerRun | null | undefined) => !!run && ['gathering', 'screening', 'choosing', 'confirming'].includes(run.stage)
const dps = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value)).toLocaleString('en-US')}`
const loadOptions = (Object.entries(optimizerLoads) as Array<[OptimizerLoad, (typeof optimizerLoads)[OptimizerLoad]]>).map(([value, load]) => ({ value, label: `${load.label} · ${load.threads ? `${load.threads} threads` : 'half your threads'}` }))
const scenarioOptions = (Object.entries(simulationScenarios) as Array<[SimulationScenarioId, (typeof simulationScenarios)[SimulationScenarioId]]>).map(([value, scenario]) => ({ value, label: scenario.label }))

/**
 * Finds the best gear combination: every piece you own, plus drops and top-player items you could still get, tested
 * alone in SimulationCraft, combined into whole sets, and the best sets confirmed with a precise run
 */
export function BestGearPage({ character, activity }: { character: Character; activity: Activity }) {
  const client = useQueryClient()
  const provider = useAiProvider()
  const [scenario, setScenario] = useState<SimulationScenarioId>(activity === 'raiding' ? 'patchwerk' : 'dungeon-slice')
  const [targets, setTargets] = useState(true)
  const [load, setLoad] = useState<OptimizerLoad>('light')
  const run = useQuery({ queryKey: ['optimizer', character.id], queryFn: () => api.optimizerRun(character.id), refetchInterval: query => running(query.state.data) ? 1500 : false })
  const workspace = useQuery({ queryKey: ['simulations', character.id], queryFn: () => api.simulationWorkspace({ characterId: character.id }), staleTime: 60_000 })
  const start = useMutation({ mutationFn: () => api.startOptimizer({ characterId: character.id, activity, scenarioId: scenario, includeTargets: targets, load }), onSuccess: value => client.setQueryData(['optimizer', character.id], value) })
  const cancel = useMutation({ mutationFn: () => api.cancelOptimizer(character.id), onSuccess: () => void run.refetch() })
  const current = run.data
  const busy = running(current) || start.isPending

  if (activity === 'pvp') return <EmptyState icon={WandSparkles} title="Best gear is for PvE" description="SimulationCraft models dungeon and raid damage, so switch the activity to Mythic+ or Raiding" />
  if (workspace.data && !workspace.data.configured) return <EmptyState icon={Cpu} title="Choose SimulationCraft first" description="Best gear runs SimulationCraft on this computer. Pick its program in Settings → Integrations, then come back" />

  return (
    <div className="best-gear">
      <Card as="section" className="best-gear-setup" aria-labelledby="best-gear-title">
        <div className="best-gear-intro">
          <h2 id="best-gear-title"><WandSparkles size={18} aria-hidden="true" />Find your best gear</h2>
          <p>Every piece you own, plus the drops and top-player items you could still get, tested together in SimulationCraft</p>
        </div>
        <div className="best-gear-controls">
          <AppSelect aria-label="Fight" value={scenario} options={scenarioOptions} disabled={busy} onValueChange={value => setScenario(value as SimulationScenarioId)} />
          <AppSelect aria-label="Processor load" value={load} options={loadOptions} disabled={busy} onValueChange={value => setLoad(value as OptimizerLoad)} />
          <Toggle type="button" variant="outline" className="workspace-toggle" pressed={targets} disabled={busy} onPressedChange={setTargets}><Target size={14} aria-hidden="true" />{targets ? 'With targets' : 'Owned only'}</Toggle>
          {running(current)
            ? <Button disabled={cancel.isPending} onClick={() => cancel.mutate()}><Square size={13} aria-hidden="true" />Stop</Button>
            : <Button variant="primary" disabled={busy} onClick={() => start.mutate()}>{current?.stage === 'done' ? <RefreshCw size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}{current?.stage === 'done' ? 'Run again' : 'Find my best gear'}</Button>}
        </div>
        <p className="muted small best-gear-note">
          {provider ? <><ProviderIcon id={provider.id} size={13} />{provider.name} picks which sets to test</> : 'The app picks which sets to test · connect an AI assistant in Settings to weigh set bonuses and pairs too'}
          {' · '}Runs at low priority. Light load is the safe default; heavier loads finish sooner but can reset a computer with unstable power or cooling
        </p>
        {start.isError && <p className="error small" role="alert">{errorMessage(start.error)}</p>}
      </Card>

      {current && (running(current) || current.stage === 'failed' || current.stage === 'cancelled') && <Forge run={current} />}
      {current?.stage === 'done' && <Results run={current} character={character} />}
      {!current && !run.isPending && <EmptyState icon={WandSparkles} title="No search yet" description="Pick a fight and start. Screening every piece takes a few minutes; you can keep using the app meanwhile" />}
    </div>
  )
}

const minutes = (ms: number) => ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`

/** Time since a moment, ticking each second while a stage runs */
function useElapsed(since: string, live: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!live) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [live])
  const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

/**
 * The search as it runs: a stage track, and a slot board where each slot's candidates cycle while they're tested, the
 * picked pieces light up while sets are chosen, and settle into place as the best set is confirmed
 */
export function Forge({ run }: { run: OptimizerRun }) {
  const live = running(run)
  const elapsed = useElapsed(run.stageStartedAt, live)
  const at = optimizerStages.indexOf(run.stage as (typeof optimizerStages)[number])
  const bySlot = useMemo(() => { const map = new Map<GearSlot, OptimizerCandidate[]>(); for (const candidate of run.pool) map.set(candidate.slot, [...(map.get(candidate.slot) ?? []), candidate]); return map }, [run.pool])
  const picked = useMemo(() => new Set(run.combos.flatMap(combo => Object.values(combo.picks))), [run.combos])
  return (
    <Card as="section" className="forge" data-stage={run.stage} aria-live="polite">
      <ol className="forge-track" aria-label="Progress">
        {optimizerStages.slice(0, 4).map((stage, index) => <li key={stage} data-state={index < at ? 'done' : index === at ? 'on' : 'next'}><span>{index < at ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{stageLabels[stage]}</li>)}
      </ol>
      <p className="forge-status">
        {run.stage === 'failed' ? <span className="error" role="alert">{(run.failure ?? 'The search stopped').split(' — ')[0]} · the troubleshooting log in Settings → Local data has the details</span>
          : run.stage === 'cancelled' ? 'Stopped'
            : <>{stageLabels[run.stage as (typeof optimizerStages)[number]]} · {elapsed}{run.stage === 'screening' ? ` · ${run.pool.length} pieces on ${run.threads} threads` : run.stage === 'confirming' ? ` · ${run.combos.length} sets on ${run.threads} threads` : ''}{run.stage === 'choosing' && run.provider ? ` with ${run.provider}` : ''}</>}
      </p>
      {/* The board is the picture of the search; the status line above says the same in words */}
      <div className="forge-board" aria-hidden="true">
        {slotOrder.map((slot, index) => {
          const list = bySlot.get(slot) ?? []
          const chosen = list.filter(candidate => picked.has(candidate.key))
          const shown = (run.stage === 'choosing' || run.stage === 'confirming') && chosen.length ? chosen : list
          return (
            <div key={slot} className="forge-slot" data-empty={list.length ? undefined : true} data-picked={chosen.length ? true : undefined} style={{ '--delay': `${index * 90}ms` } as React.CSSProperties}>
              <small>{gearSlotLabels[slot]}</small>
              <span className="forge-reel" data-cycling={shown.length > 1 ? true : undefined}>{(shown.length > 1 ? [0, 1, 2, 3].map(at => shown[at % shown.length]!) : shown).map((candidate, at) => <span key={`${candidate.key}-${at}`} style={{ '--at': at } as React.CSSProperties}><ItemIcon icon={candidate.icon} quality={candidate.quality ?? undefined} size="small" /></span>)}</span>
              <b>{!list.length ? 'Nothing to test' : chosen.length && (run.stage === 'choosing' || run.stage === 'confirming') ? `${chosen.length} in a set` : `${list.length} to test`}</b>
            </div>
          )
        })}
      </div>
      {run.summary && run.stage !== 'done' && <p className="forge-summary">{run.summary}</p>}
      {run.warning && <p className="best-gear-warning" role="status"><TriangleAlert size={14} aria-hidden="true" />{run.warning}</p>}
    </Card>
  )
}

export function Results({ run, character }: { run: OptimizerRun; character: Character }) {
  const byKey = useMemo(() => new Map(run.pool.map(candidate => [candidate.key, candidate])), [run.pool])
  const sets = [...run.combos].filter(combo => run.results[combo.key]).sort((a, b) => run.results[b.key]!.gain - run.results[a.key]!.gain)
  const wearNow = run.combos.find(combo => combo.key === run.wearNow)
  const changed = gearChanged(run, character.gear)
  return (
    <>
      {changed && <p className="best-gear-warning" role="status"><TriangleAlert size={14} aria-hidden="true" />Your gear changed since this run, so these results compare against what you wore then · run it again</p>}
      {run.warning && <p className="best-gear-warning" role="status"><TriangleAlert size={14} aria-hidden="true" />{run.warning}</p>}
      <div className="best-gear-results">
        <SetCard title="Wear now" empty="Nothing you own beats what you wear in this fight" combo={wearNow} run={run} byKey={byKey} character={character} />
        {run.includeTargets && <UpgradeCard run={run} character={character} />}
      </div>
      <p className="muted small best-gear-meta">{simulationScenarios[run.scenarioId].label} · ran {new Date(run.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{run.finishedAt ? ` · took ${minutes(Date.parse(run.finishedAt) - Date.parse(run.startedAt))}` : ''} · {Object.keys(run.screen).length} of {run.pool.length} pieces measured</p>
      {run.summary && <Card className="best-gear-summary"><p>{run.provider ? <ProviderIcon id={run.provider.toLowerCase()} size={14} /> : <Sparkles size={14} aria-hidden="true" />}{run.summary}</p></Card>}
      <Card as="section" aria-labelledby="best-gear-sets">
        <div className="surface-heading"><h2 id="best-gear-sets">Every set tested</h2><p>{simulationScenarios[run.scenarioId].label} · gain over what you wear now, with its margin of error</p></div>
        {!sets.length && <p className="muted small">No set beat what you wear, so none needed a precise run</p>}
        <div className="best-gear-sets">
          {sets.map(combo => {
            const result = run.results[combo.key]!
            return (
              <div key={combo.key} className="best-gear-set" data-best={combo.key === run.wearNow || combo.key === run.chase ? true : undefined}>
                <span><b>{combo.label}{combo.key === run.wearNow && <Badge tone="green">Wear now</Badge>}{combo.key === run.chase && <Badge tone="blue">Worth chasing</Badge>}</b>{combo.why && <small>{combo.why}</small>}</span>
                <Badge tone={combo.by === 'ai' ? 'blue' : 'neutral'}>{combo.by === 'ai' ? run.provider ?? 'AI' : 'App'}</Badge>
                <span className="best-gear-gain" data-sign={result.gain >= 0 ? 'up' : 'down'}>{dps(result.gain)}<small>{result.error != null ? ` ±${Math.round(result.error * 1.96).toLocaleString('en-US')}` : ''}</small></span>
              </div>
            )
          })}
        </div>
        {run.notes.length > 0 && <details className="best-gear-notes"><summary>{run.notes.length} pieces or sets couldn't run</summary><ul>{run.notes.slice(0, 40).map((note, at) => <li key={at}>{note}</li>)}</ul></details>}
        <p className="muted small dungeon-note">Modeled damage per second in SimulationCraft, not player skill. Targets use the top regular upgrade level; owned pieces take the enchant you use in that slot</p>
      </Card>
    </>
  )
}

function SetCard({ title, empty, combo, run, byKey, character }: { title: string; empty: string; combo: OptimizerCombo | undefined; run: OptimizerRun; byKey: Map<string, OptimizerCandidate>; character: Character }) {
  const result = combo ? run.results[combo.key] : undefined
  const changes = combo ? (Object.entries(combo.picks) as Array<[GearSlot, string]>).sort((a, b) => slotOrder.indexOf(a[0]) - slotOrder.indexOf(b[0])) : []
  return (
    <Card as="section" className="best-gear-set-card" data-kind={title === 'Wear now' ? 'own' : 'chase'}>
      <h3>{title}</h3>
      {!combo || !result ? <p className="muted">{empty}</p> : <>
        <p className="best-gear-headline"><b>{dps(result.gain)}</b><span>damage per second{run.baseline ? ` · ${(result.gain / run.baseline * 100).toFixed(1)}%` : ''}</span></p>
        <ul className="best-gear-changes">
          {changes.map(([slot, key]) => {
            const candidate = byKey.get(key)
            if (!candidate) return null
            const from = character.gear.find(item => item.slot === slot)
            return (
              <li key={slot}>
                <small>{gearSlotLabels[slot]}</small>
                <ItemHoverCard itemId={candidate.item.itemId} name={candidate.item.name}>
                  <span className="best-gear-item" tabIndex={0}>
                    <ItemIcon icon={candidate.icon} quality={candidate.quality ?? undefined} size="small" />
                    <span><b className={`quality-text-${candidate.quality ?? 4}`}>{candidate.item.name}</b><small>{candidate.item.itemLevel} · {from ? <>replaces {from.name} ({from.itemLevel})</> : 'empty slot'}</small></span>
                  </span>
                </ItemHoverCard>
                <Badge tone={isOwned(candidate) ? 'green' : 'amber'}>{candidate.source ?? originLabels[candidate.origin]}</Badge>
              </li>
            )
          })}
        </ul>
        {combo.why && <p className="muted small"><ArrowRight size={12} aria-hidden="true" /> {combo.why}</p>}
      </>}
    </Card>
  )
}

/** The pieces to farm next, one row each, ranked by what each adds beyond the best you own for its slot */
function UpgradeCard({ run, character }: { run: OptimizerRun; character: Character }) {
  const upgrades = useMemo(() => upgradesToChase(run), [run])
  const together = run.chase ? run.results[run.chase] : undefined
  return (
    <Card as="section" className="best-gear-set-card" data-kind="chase">
      <h3>Worth chasing</h3>
      {!upgrades.length ? <p className="muted">No drop or top-player piece clearly beats the best of what you own</p> : <>
        <p className="muted small">Each piece alone, over the best you own for that slot</p>
        <ul className="best-gear-changes">
          {upgrades.map(({ candidate, gain }) => {
            const from = character.gear.find(item => item.slot === candidate.slot)
            return (
              <li key={candidate.key}>
                <small>{gearSlotLabels[candidate.slot]}</small>
                <ItemHoverCard itemId={candidate.item.itemId} name={candidate.item.name}>
                  <span className="best-gear-item" tabIndex={0}>
                    <ItemIcon icon={candidate.icon} quality={candidate.quality ?? undefined} size="small" />
                    <span><b className={`quality-text-${candidate.quality ?? 4}`}>{candidate.item.name}</b><small>{candidate.item.itemLevel} · {candidate.source ?? originLabels[candidate.origin]}{from ? ` · replaces ${from.name} (${from.itemLevel})` : ''}</small></span>
                  </span>
                </ItemHoverCard>
                <span className="best-gear-gain" data-sign="up">{dps(gain)}<small>{run.baseline ? ` ${(gain / run.baseline * 100).toFixed(1)}%` : ''}</small></span>
              </li>
            )
          })}
        </ul>
        {together && <p className="muted small"><ArrowRight size={12} aria-hidden="true" /> The best set with targets measured {dps(together.gain)} damage per second</p>}
      </>}
    </Card>
  )
}
