import { useEffect, useMemo, useReducer, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ClipboardList, FlaskConical, Plus, Shield, Sparkles, Trophy } from 'lucide-react'
import { gearItemSchema, type Activity, type Character, type GearItem } from '../../../shared/domain'
import { compareSimulationValues, requestScenario, simulationScenarios, type SimulationJob } from '../../../shared/simulation'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { addSimulatedItemsToPlan, gearMemory, planHolds, planKey, subscribeGearPlan } from '../../lib/plan-item'
import { Badge, Button } from '../../components/ui/primitives'
import { Card } from '../../components/ui/card'
import { AppSelect } from '../../components/AppSelect'
import { ItemIcon } from '../items/ItemIcon'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { BenchmarkSummary } from './BenchmarkSummary'
import { PlanSummary } from './PlanSummary'
import { SimCompare } from './SimCompare'
import './simulation-detail.css'

type Result = NonNullable<SimulationJob['result']>
type Value = Result['values'][number]
type Verdict = ReturnType<typeof compareSimulationValues>['verdict']
const PAGE = 12
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`
const activityName = (activity: Activity) => activity === 'raiding' ? 'Raiding' : activity === 'pvp' ? 'PvP' : 'Mythic+'

function kindOf(job: SimulationJob) {
  if (job.request.plan) return { icon: ClipboardList, label: 'Gear plan' }
  if (job.request.benchmark) return { icon: Trophy, label: 'Top players' }
  return { icon: FlaskConical, label: job.request.candidates.length ? 'Gear swaps' : 'Simulation' }
}
function verdictText(verdict: Verdict, difference: number, mean: number) {
  if (verdict === 'unknown') return 'Comparison unavailable'
  if (verdict === 'sidegrade') return 'Within uncertainty'
  return `${signed(difference)} DPS · ${percent(difference / mean)}`
}
/** Damage taken change as a compact number, for the chart */
function takenShort(baseline: Value, value: Value) {
  if (!value.damageTaken || !baseline.damageTaken) return null
  const comparison = compareSimulationValues(baseline.damageTaken, value.damageTaken)
  if (comparison.verdict === 'unknown' || comparison.verdict === 'sidegrade') return null
  return `${comparison.difference < 0 ? '−' : '+'}${Math.abs(Math.round(comparison.difference)).toLocaleString()}`
}
function takenText(baseline: Value, value: Value) {
  if (!baseline.damageTaken || !value.damageTaken) return null
  const taken = compareSimulationValues(baseline.damageTaken, value.damageTaken)
  if (taken.verdict === 'unknown') return null
  return taken.verdict === 'sidegrade' ? 'Damage taken about the same' : `${Math.abs(Math.round(taken.difference)).toLocaleString()} ${taken.difference < 0 ? 'less' : 'more'} damage taken per second`
}

/** One simulation in full: the reading, every result ranked on one scale, and each result item by item */
export function SimulationDetail({ character, activity, job, onBack }: { character: Character; activity: Activity; job: SimulationJob; onBack: () => void }) {
  const result = job.result
  const baseline = result?.values[0] ?? null
  const kind = kindOf(job)
  const scenario = requestScenario(job.request)
  const [planActivity, setPlanActivity] = useState<Activity>(job.request.plan?.activity ?? (activity === 'raiding' ? 'raiding' : 'mythicPlus'))
  const [all, setAll] = useState(false)
  // One list of results, read as a ranked chart or as item-by-item cards
  const [view, setView] = useState<'ranked' | 'items'>('ranked')
  const [, refresh] = useReducer((count: number) => count + 1, 0)

  useEffect(() => subscribeGearPlan(refresh), [])
  const queryClient = useQueryClient()
  const plans = useQuery({ queryKey: ['gear-draft', character.id, 'simulation-plans', character.specId], queryFn: async () => { const [mythicPlus, raiding] = await Promise.all([api.getGearDraft({ characterId: character.id, activity: 'mythicPlus', specId: character.specId }), api.getGearDraft({ characterId: character.id, activity: 'raiding', specId: character.specId })]); return { mythicPlus, raiding } } })
  const planItems = (value: Activity) => gearMemory.get(planKey(character.id, value, character.specId))?.items ?? plans.data?.[value === 'raiding' ? 'raiding' : 'mythicPlus']?.items ?? null
  const current = planItems(planActivity)

  const before = useMemo(() => new Map(job.request.baseline.items.map(item => [item.slot, gearItemSchema.parse(item)])), [job.request.baseline.items])
  const entries = useMemo(() => {
    if (!result || !baseline) return []
    return result.values.slice(1).map((value, index) => {
      const comparison = compareSimulationValues(baseline, value)
      const items = (job.request.candidates[index] ?? []).map(item => gearItemSchema.parse(item))
      return { value, index, comparison, items, label: job.request.candidateLabels[index] ?? `Result ${index + 1}` }
    }).sort((a, b) => b.value.mean - a.value.mean)
  }, [result, baseline, job.request.candidates, job.request.candidateLabels])
  const ids = useMemo(() => [...new Set([...job.request.baseline.items, ...entries.flatMap(entry => entry.items)].flatMap(item => item.itemId ? [item.itemId] : []))], [job.request.baseline.items, entries])
  const details = useQuery({ queryKey: ['simulation-item-details', ids], queryFn: () => api.getItems(ids), enabled: ids.length > 0, retry: false, staleTime: 60_000 })
  const icons = useMemo(() => new Map((details.data ?? []).map(item => [item.id, item])), [details.data])
  const best = entries.find(entry => entry.comparison.verdict === 'higher') ?? null
  // The header's second number is what this run was for: your whole plan, the top players' setup, or the best option
  const plan = job.request.plan
  const wholePlan = plan ? entries.find(entry => entry.index === (plan.whole ?? 0)) ?? null : null
  const topGear = plan?.top ? entries.find(entry => entry.index === plan.top!.index) ?? null : null
  // A plan run measured against top players answers one question first: is the finished plan as strong as their gear
  const versusTop = wholePlan && topGear ? compareSimulationValues(topGear.value, wholePlan.value) : null
  const headline = plan ? wholePlan : best
  const headlineLabel = plan ? 'With your whole plan' : job.request.benchmark ? `With ${headline?.label.replace(/^Top players'/, "the top players'") ?? "the top players' setup"}` : `With ${headline?.label ?? 'the best option'}`
  const scale = Math.max(1, ...entries.map(entry => Math.abs(entry.comparison.difference) + (entry.comparison.uncertainty ?? 0)))
  const shown = all ? entries : entries.slice(0, PAGE)
  // The chart is compact, so it shows every result unless a profileset run holds hundreds
  const charted = all || entries.length <= 40 ? entries : entries.slice(0, PAGE)

  async function add(items: GearItem[], label: string) {
    try {
      await addSimulatedItemsToPlan({ character, activity: planActivity, items, message: `${label} added to your ${activityName(planActivity)} plan` })
      await queryClient.invalidateQueries({ queryKey: ['gear-draft', character.id] })
    } catch (error) { notify(errorMessage(error)) }
  }

  const Icon = kind.icon
  const header = <Card className="sim-hero" role="banner">
      <div className="sim-hero-main">
        <span className="sim-hero-eyebrow"><Icon size={14} />{kind.label}</span>
        <h2>{job.label}</h2>
        <div className="sim-hero-chips">
          <Badge>{simulationScenarios[job.request.scenarioId].label}</Badge>
          {scenario.targets && scenario.targets > 1 ? <Badge>{scenario.targets} targets</Badge> : null}
          <Badge>{Math.round(scenario.fightSeconds / 60 * 10) / 10} min fight</Badge>
          <Badge>{job.request.options.iterations.toLocaleString()} iterations</Badge>
          <Badge>{new Date(job.createdAt).toLocaleString()}</Badge>
        </div>
      </div>
      <div className="sim-hero-stats">
        {versusTop && wholePlan
          ? <div><span>Your finished plan</span><strong>{Math.round(wholePlan.value.mean).toLocaleString()}</strong><small>DPS{wholePlan.value.standardError != null ? ` · ±${Math.round(wholePlan.value.standardError * 1.96).toLocaleString()}` : ''}</small></div>
          : <div><span>Current gear</span><strong>{baseline ? Math.round(baseline.mean).toLocaleString() : '—'}</strong><small>DPS{baseline?.standardError != null ? ` · ±${Math.round(baseline.standardError * 1.96).toLocaleString()}` : ''}</small></div>}
        {versusTop && topGear && versusTop.verdict !== 'unknown' ? <div className="sim-hero-best" data-verdict={versusTop.verdict}><span>Your plan against top players' gear</span><strong>{versusTop.verdict === 'sidegrade' ? 'Even' : `${signed(versusTop.difference)} DPS`}</strong><small>{versusTop.verdict === 'sidegrade' ? 'No measurable difference once your plan is done' : `${percent(Math.abs(versusTop.difference) / topGear.value.mean).replace(/^[+−]/, '')} ${versusTop.difference > 0 ? 'more' : 'less'} damage than their gear`}</small></div>
        : headline && baseline && headline.comparison.verdict !== 'unknown' && <div className="sim-hero-best" data-verdict={headline.comparison.verdict}><span title={headlineLabel}>{headlineLabel}</span><strong>{headline.comparison.verdict === 'sidegrade' ? 'About the same' : `${signed(headline.comparison.difference)} DPS`}</strong><small>{headline.comparison.verdict === 'sidegrade' ? 'No measurable change from your current gear' : `${percent(Math.abs(headline.comparison.difference) / baseline.mean).replace(/^[+−]/, '')} ${headline.comparison.difference > 0 ? 'more' : 'less'} damage than your current gear`}</small></div>}
      </div>
    </Card>
  return <div className="sim-detail">
    <Button variant="quiet" className="sim-detail-back" onClick={onBack}><ArrowLeft size={15} />All simulations</Button>
    {header}

    {job.failure && <p role="alert" className="error-surface">{job.failure.replace(/\.+$/, '')}</p>}
    {!result && !job.failure && <Card className="sim-panel"><p className="muted">This simulation is {job.state} · Results appear here when it finishes</p></Card>}

    {result && baseline && <>
      {(job.request.plan || job.request.benchmark) && <Card className="sim-panel" role="region" aria-label="Reading">
        {job.request.benchmark && <BenchmarkSummary job={job} result={result} />}
        {job.request.plan && <PlanSummary job={job} result={result} />}
        {(job.request.plan?.top || job.request.benchmark) && <SimCompare character={character} job={job} result={result} />}
      </Card>}

      {entries.length > 0 && <Card className="sim-panel sim-results-panel" role="region" aria-label="Results">
        <div className="sim-panel-heading sim-toolbar">
          <div><h3>Results</h3><p className="muted">{view === 'ranked' ? 'Change from your current gear · The thin line marks the 95% uncertainty' : 'What each result changes, and what it is worth'}</p></div>
          <div className="sim-toolbar-plan">
            <div className="segments" aria-label="Results view">
              <button aria-pressed={view === 'ranked'} onClick={() => setView('ranked')}>Ranked</button>
              <button aria-pressed={view === 'items'} onClick={() => setView('items')}>Item by item</button>
            </div>
            {view === 'items' && <><span>Add to</span><AppSelect label="Plan to add items to" value={planActivity} onValueChange={value => setPlanActivity(value as Activity)} options={(['mythicPlus', 'raiding'] as const).map(value => { const draft = plans.data?.[value]; return { value, label: `${activityName(value)} plan${draft?.items.length ? ` · ${draft.name}` : ' · New'}` } })} /></>}
          </div>
        </div>
        {view === 'ranked' ? <ol className="sim-chart">
          {charted.map(entry => {
            const width = Math.abs(entry.comparison.difference) / scale * 50
            const spread = (entry.comparison.uncertainty ?? 0) / scale * 50
            const center = 50 + (entry.comparison.difference >= 0 ? width : -width)
            return <li key={entry.value.name} data-verdict={entry.comparison.verdict}>
              <span className="sim-chart-label" title={entry.label}>{entry.label}</span>
              <span className="sim-chart-track" aria-hidden="true">
                <span className="sim-chart-zero" />
                <span className="sim-chart-bar" style={{ left: `${entry.comparison.difference >= 0 ? 50 : 50 - width}%`, width: `${Math.max(width, .4)}%` }} />
                {spread > 0 && <span className="sim-chart-spread" style={{ left: `${Math.max(0, center - spread)}%`, width: `${Math.min(100, spread * 2)}%` }} />}
              </span>
              <span className="sim-chart-value">{entry.comparison.verdict === 'unknown' ? '—' : signed(entry.comparison.difference)}{takenText(baseline, entry.value) && <small title={takenText(baseline, entry.value)!}><Shield size={11} />{takenShort(baseline, entry.value)}</small>}</span>
            </li>
          })}
        </ol> : <>
        <div className="sim-cards">
          {shown.map((entry, rank) => {
            const inPlan = planHolds(current, entry.items)
            const taken = takenText(baseline, entry.value)
            return <Card size="sm" className="sim-card" key={entry.value.name} data-verdict={entry.comparison.verdict}>
              <header>
                <span className="sim-card-rank">{rank + 1}</span>
                <strong className="sim-card-title">{entry.label}</strong>
                <span className="sim-card-delta">{verdictText(entry.comparison.verdict, entry.comparison.difference, baseline.mean)}</span>
              </header>
              {taken && <p className="sim-card-taken"><Shield size={13} />{taken}</p>}
              {entry.items.length ? <ul className="sim-swaps">
                {entry.items.map(item => {
                  const was = before.get(item.slot)
                  const gain = item.itemLevel != null && was?.itemLevel != null ? item.itemLevel - was.itemLevel : null
                  return <li key={item.slot}>
                    <span className="sim-swap-slot">{gearSlotLabels[item.slot]}</span>
                    <Piece item={was ?? null} icon={was?.itemId ? icons.get(was.itemId) : undefined} muted />
                    <ArrowRight className="sim-swap-arrow" size={15} aria-hidden="true" />
                    <Piece item={item} icon={item.itemId ? icons.get(item.itemId) : undefined} />
                    {gain !== null && gain !== 0 && <span className="sim-swap-gain" data-up={gain > 0}>{gain > 0 ? '+' : '−'}{Math.abs(gain)}</span>}
                  </li>
                })}
              </ul> : <p className="sim-card-note"><Sparkles size={14} />Changes talents only, so there is nothing to add to a plan</p>}
              {entry.items.length > 0 && <footer>
                {inPlan ? <span className="sim-card-inplan"><Check size={14} />In your {activityName(planActivity)} plan</span>
                  : <Button variant={entry.comparison.verdict === 'higher' ? 'primary' : undefined} onClick={() => void add(entry.items, entry.items.length === 1 ? entry.items[0]!.name : `${entry.items.length} items`)}><Plus size={14} />{entry.items.length === 1 ? 'Add to plan' : `Add ${entry.items.length} items to plan`}</Button>}
              </footer>}
            </Card>
          })}
        </div>
        {entries.length > PAGE && <Button variant="quiet" onClick={() => setAll(value => !value)}>{all ? `Show the top ${PAGE}` : `Show all ${entries.length} results`}</Button>}
        </>}
      </Card>}

      {!entries.length && <Card className="sim-panel" role="region" aria-label="Your gear">
        <div className="sim-panel-heading"><div><h3>Your simulated gear</h3><p className="muted">This run measured your current gear only</p></div></div>
        <ul className="sim-gear">{[...before.values()].map(item => <li key={item.slot}><span className="sim-swap-slot">{gearSlotLabels[item.slot]}</span><Piece item={item} icon={item.itemId ? icons.get(item.itemId) : undefined} /></li>)}</ul>
      </Card>}

      <Card className="sim-panel"><details className="sim-meta">
        <summary><span>About this result</span><Badge tone={result.applicability === 'current' ? 'green' : 'neutral'}>{result.applicability === 'current' ? 'Applies to your current gear' : result.reasons.length ? `${result.reasons.length === 1 ? 'One thing has' : `${result.reasons.length} things have`} changed since` : 'Historical result'}</Badge></summary>
        <p className="muted">SimulationCraft {result.engine.version} · Modeled damage of your character playing without mistakes · Compare with other runs of your own character, not with damage meters</p>
        {result.reasons.length > 0 && <ul className="muted">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      </details></Card>
    </>}
  </div>
}

function Piece({ item, icon, muted = false }: { item: GearItem | null; icon?: { icon: number | null; quality: number }; muted?: boolean }) {
  if (!item) return <span className="sim-piece" data-muted={muted}><span className="sim-piece-name muted">Empty</span></span>
  const body = <span className="sim-piece" data-muted={muted}>
    <ItemIcon icon={icon?.icon} quality={icon?.quality} size="small" />
    <span className="sim-piece-text"><span className="sim-piece-name" data-quality={icon?.quality ?? 1}>{item.name}</span><small>{item.itemLevel != null ? `Item level ${item.itemLevel}` : 'Item level unknown'}</small></span>
  </span>
  return <ItemHoverCard gear={item}>{body}</ItemHoverCard>
}
