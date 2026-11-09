import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { benchmarkReading, gearSlotLabels, type GearSlotName } from '../../../shared/simulation-benchmark'

type Result = NonNullable<SimulationJob['result']>
type Value = Result['values'][number]
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`

function change(baseline: Value, value: Value) {
  const comparison = compareSimulationValues(baseline, value)
  const text = comparison.verdict === 'unknown' ? 'Comparison unavailable' : comparison.verdict === 'sidegrade' ? 'No measurable difference' : `${signed(comparison.difference)} DPS · ${percent(comparison.difference / baseline.mean)}`
  const taken = value.damageTaken && baseline.damageTaken ? compareSimulationValues(baseline.damageTaken, value.damageTaken) : null
  const takenText = !taken || taken.verdict === 'unknown' ? null : taken.verdict === 'sidegrade' ? 'Damage taken about the same' : `${Math.abs(Math.round(taken.difference)).toLocaleString()} ${taken.difference < 0 ? 'less' : 'more'} damage taken per second`
  return { comparison, text, takenText }
}

/** A saved plan in plain words: what the whole plan adds, then which planned upgrade is worth the most */
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
  // How far the whole plan gets you toward the top players' gear, judged with the same uncertainty as every comparison
  const reading = topEntry ? benchmarkReading(whole.value, [{ kind: 'gear', value: topEntry.value }]) : null
  const topGain = topEntry ? change(whole.value, topEntry.value) : null
  const total = change(baseline, whole.value)
  const losses = singles.filter(entry => entry.comparison.verdict === 'lower')
  const gains = singles.filter(entry => entry.comparison.verdict === 'higher')
  const headline = total.comparison.verdict === 'higher' ? `${signed(total.comparison.difference)} DPS` : total.comparison.verdict === 'lower' ? `${signed(total.comparison.difference)} DPS` : 'About the same'
  const advice = total.comparison.verdict === 'unknown' ? 'The engine did not report uncertainty, so the change cannot be judged'
    : gains[0] ? `Get ${gains[0].label.replace(/^[^:]+: /, '')} first, it is the biggest single upgrade in your plan${losses.length ? ` · ${losses.length === 1 ? 'One planned item is' : `${losses.length} planned items are`} worse than what you wear now` : ''}`
    : losses.length ? 'None of the planned items beats what you wear now in this scenario' : 'Each planned upgrade is too small to measure on its own here'
  return <div className="simulation-benchmark">
    <div className="simulation-benchmark-headline">
      <span className="muted">{plan.whole === null ? 'Your plan changes one slot' : `Your plan · ${plan.swaps.length} upgrades together`}</span>
      <strong>{headline}</strong>
      {total.comparison.verdict !== 'unknown' && total.comparison.verdict !== 'sidegrade' && <span className="muted">{percent(total.comparison.difference / baseline.mean)} over your current gear{total.takenText ? ` · ${total.takenText}` : ''}</span>}
      <p>{advice}</p>
    </div>
    {plan.top && reading && topGain && <>
      <h3 className="simulation-subheading">Against the top players</h3>
      <div className="simulation-benchmark-headline">
        <strong>{reading.matches ? "As strong as the top players' gear" : `${Math.round(reading.share * 100)}% of the top players' gear`}</strong>
        <p>{reading.matches ? 'Once your plan is done, items stop being the gap' : `Their most worn items add ${topGain.text.replace(/ · .*/, '')} over your finished plan${plan.top.differences.length ? ` · ${plan.top.differences.length === 1 ? 'One slot differs' : `${plan.top.differences.length} slots differ`}` : ''}`}</p>
      </div>
      <div className="simulation-benchmark-meter" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.round(reading.share * 100))}%` }} /></div>
      {plan.top.differences.length > 0 && <dl className="simulation-benchmark-rows">
        {plan.top.differences.map(item => <div key={item.slot}><dt>{gearSlotLabels[item.slot as GearSlotName] ?? item.slot}</dt><dd>{`${item.top} at ${item.itemLevel}`}<small className="muted">{item.plan === item.top ? 'Top players wear it at a higher item level' : `Your plan has ${item.plan}`}</small></dd></div>)}
      </dl>}
      <p className="muted">{plan.top.population} · Measured on your character with your enchants and gems</p>
    </>}
    {plan.whole !== null && <>
      <h3 className="simulation-subheading">Upgrades by value</h3>
      <dl className="simulation-benchmark-rows">
        {singles.map(entry => <div key={entry.value.name}><dt>{entry.label}</dt><dd>{entry.comparison.verdict === 'lower' ? `Worse · ${entry.text}` : entry.text}{entry.takenText && <small className="muted">{entry.takenText}</small>}</dd></div>)}
      </dl>
      <p className="muted">Stats interact, so the upgrades do not add up exactly to the whole plan</p>
    </>}
    <details className="simulation-details"><summary>What was tested</summary>
      <ul>
        {plan.swaps.map(item => <li key={item.slot}>{item.from === item.to ? `${item.to} raised to item level ${item.itemLevel}` : `${item.from} → ${item.to} at item level ${item.itemLevel}`}</li>)}
        {plan.skipped.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      <p>Planned items without an exact item link keep the enchant and gems of what you wear in that slot · Item bonuses such as extra sockets are not modeled</p>
    </details>
  </div>
}
