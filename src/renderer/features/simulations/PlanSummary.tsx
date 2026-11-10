import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { benchmarkReading, gearSlotLabels, type GearSlotName } from '../../../shared/simulation-benchmark'

type Result = NonNullable<SimulationJob['result']>
type Value = Result['values'][number]
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`
/** "Main hand: Maze-roa, Warlord's Fury at 344" reads as just the item in a tile */
const itemOnly = (label: string) => label.replace(/^[^:]+: /, '').replace(/ at \d+$/, '')

function change(baseline: Value, value: Value) {
  const comparison = compareSimulationValues(baseline, value)
  const taken = value.damageTaken && baseline.damageTaken ? compareSimulationValues(baseline.damageTaken, value.damageTaken) : null
  const takenText = !taken || taken.verdict === 'unknown' || taken.verdict === 'sidegrade' ? null : `${Math.abs(Math.round(taken.difference)).toLocaleString()} ${taken.difference < 0 ? 'less' : 'more'} damage taken per second`
  return { comparison, takenText }
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'up' | 'down' }) {
  return <div className="plan-tile" data-tone={tone}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
}

/**
 * A saved plan in three numbers: what the whole plan adds, how close it gets to the top players' gear, and which
 * upgrade to get first. The per-upgrade list lives in the results below, so it is not repeated here
 */
export function PlanSummary({ job, result }: { job: SimulationJob; result: Result }) {
  const plan = job.request.plan
  const baseline = result.values[0]
  if (!plan || !baseline) return null
  const entries = result.values.slice(1).map((value, index) => ({ value, label: job.request.candidateLabels[index] ?? `Upgrade ${index + 1}`, index }))
  const whole = plan.whole === null ? entries[0] : entries[plan.whole]
  const topIndex = plan.top?.index ?? null
  const topEntry = topIndex === null ? null : entries[topIndex] ?? null
  const singles = entries.filter(entry => entry.index !== plan.whole && entry.index !== topIndex).map(entry => ({ ...entry, ...change(baseline, entry.value) })).sort((a, b) => b.comparison.difference - a.comparison.difference)
  if (!whole) return null
  const reading = topEntry ? benchmarkReading(whole.value, [{ kind: 'gear', value: topEntry.value }]) : null
  const topGain = topEntry ? compareSimulationValues(whole.value, topEntry.value) : null
  const total = change(baseline, whole.value)
  const losses = singles.filter(entry => entry.comparison.verdict === 'lower')
  const first = singles.find(entry => entry.comparison.verdict === 'higher')
  const measured = total.comparison.verdict === 'higher' || total.comparison.verdict === 'lower'
  return <div className="plan-summary">
    <div className="plan-tiles">
      <Tile label={plan.whole === null ? 'Your plan' : `Your plan · ${plan.swaps.length} upgrades`} value={measured ? `${signed(total.comparison.difference)} DPS` : total.comparison.verdict === 'sidegrade' ? 'About the same' : 'Unknown'}
        note={measured ? `${percent(total.comparison.difference / baseline.mean)} over your current gear${total.takenText ? ` · ${total.takenText}` : ''}` : undefined} tone={total.comparison.verdict === 'higher' ? 'up' : total.comparison.verdict === 'lower' ? 'down' : undefined} />
      {reading && topGain && <Tile label="Against top players" value={reading.matches ? 'Even' : `${Math.round(reading.share * 100)}%`}
        note={reading.matches ? 'Once your plan is done, items stop being the gap' : `of their gear's damage · theirs adds ${signed(topGain.difference)} DPS more`} />}
      {first && <Tile label="Get this first" value={itemOnly(first.label)} note={`${signed(first.comparison.difference)} DPS on its own`} tone="up" />}
    </div>
    {losses.length > 0 && <p className="plan-warning">{losses.length === 1 ? `${itemOnly(losses[0]!.label)} is worse than what you wear now` : `${losses.length} planned items are worse than what you wear now`} · They are at the bottom of the results</p>}
    {plan.top && reading && !reading.matches && <details className="simulation-details plan-top">
      <summary><span className="simulation-benchmark-meter" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.round(reading.share * 100))}%` }} /></span>{plan.top.differences.length === 1 ? 'One slot differs from top players' : `${plan.top.differences.length} slots differ from top players`}</summary>
      {plan.top.differences.length > 0 && <dl className="simulation-benchmark-rows">
        {plan.top.differences.map(item => <div key={item.slot}><dt>{gearSlotLabels[item.slot as GearSlotName] ?? item.slot}</dt><dd>{`${item.top} at ${item.itemLevel}`}<small className="muted">{item.plan === item.top ? 'Top players wear it at a higher item level' : `Your plan has ${item.plan}`}</small></dd></div>)}
      </dl>}
      <p className="muted">{plan.top.population} · Their items at the highest level any of them wears, measured on your character with your enchants and gems</p>
    </details>}
    <details className="simulation-details">
      <summary>What was tested</summary>
      <ul>
        {plan.swaps.map(item => <li key={item.slot}>{item.from === item.to ? `${item.to} raised to item level ${item.itemLevel}` : `${item.from} → ${item.to} at item level ${item.itemLevel}`}</li>)}
        {plan.skipped.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      <p>Stats interact, so single upgrades do not add up exactly to the whole plan · Planned items without an exact item link keep the enchant and gems of what you wear in that slot · Item bonuses such as extra sockets are not modeled</p>
    </details>
  </div>
}
