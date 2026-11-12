import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { benchmarkReading } from '../../../shared/simulation-benchmark'

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
  // Plan minus top players' gear: positive means the finished plan does more damage than their gear
  const versus = topEntry ? compareSimulationValues(topEntry.value, whole.value) : null
  const versusValue = !versus || versus.verdict === 'unknown' ? 'Unknown' : versus.verdict === 'sidegrade' ? 'Even' : versus.difference > 0 ? 'Ahead' : 'Behind'
  const versusNote = !versus || !topEntry || versus.verdict === 'unknown' ? 'The engine did not report uncertainty, so the gap cannot be judged'
    : versus.verdict === 'sidegrade' ? 'Your finished plan matches their gear within the uncertainty'
    : `${versus.difference > 0 ? 'Your plan does' : 'Their gear does'} ${Math.abs(Math.round(versus.difference)).toLocaleString()} DPS more · ${(Math.abs(versus.difference) / topEntry.value.mean * 100).toFixed(1)}% ${versus.difference > 0 ? 'above' : 'below'} theirs`
  const totalTile = <Tile label={plan.whole === null ? 'Against your current gear' : `Against your current gear · ${plan.swaps.length} upgrades`} value={measured ? `${signed(total.comparison.difference)} DPS` : total.comparison.verdict === 'sidegrade' ? 'About the same' : 'Unknown'}
    note={measured ? `${percent(Math.abs(total.comparison.difference) / baseline.mean).replace(/^[+−]/, '')} ${total.comparison.difference > 0 ? 'more' : 'less'} damage than you do now${total.takenText ? ` · ${total.takenText}` : ''}` : undefined} tone={total.comparison.verdict === 'higher' ? 'up' : total.comparison.verdict === 'lower' ? 'down' : undefined} />
  return <div className="plan-summary">
    <div className="plan-tiles">
      {versus && <div className="plan-tile plan-verdict" data-tone={versusValue === 'Ahead' || versusValue === 'Even' ? 'up' : versusValue === 'Behind' ? 'down' : undefined}>
        <span>Your finished plan against top players' gear</span><strong>{versusValue}</strong><small>{versusNote}</small>
        {reading && <span className="simulation-benchmark-meter" aria-label={`Your plan reaches ${Math.round(reading.share * 100)}% of their gear's damage`}><span style={{ width: `${Math.max(4, Math.min(100, Math.round(reading.share * 100)))}%` }} /></span>}
      </div>}
      {totalTile}
      {first && <Tile label="Get this first" value={itemOnly(first.label)} note={`${signed(first.comparison.difference)} DPS on its own`} tone="up" />}
    </div>
    {losses.length > 0 && <p className="plan-warning">{losses.length === 1 ? `${itemOnly(losses[0]!.label)} is worse than what you wear now` : `${losses.length} planned items are worse than what you wear now`} · They are at the bottom of the results</p>}
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
