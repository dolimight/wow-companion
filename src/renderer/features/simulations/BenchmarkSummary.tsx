import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { benchmarkLabels, benchmarkReading, type BenchmarkKind } from '../../../shared/simulation-benchmark'

type Result = NonNullable<SimulationJob['result']>
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
const level = (value: number) => Number.isInteger(Math.round(value * 10) / 10) ? String(Math.round(value)) : value.toFixed(1)
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`
const slotNames: Record<string, string> = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Cloak', chest: 'Chest', wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2', mainHand: 'Main hand', offHand: 'Off hand' }

/** Reads a top-player comparison in plain words: how close you are, and whether items or talents make the gap */
export function BenchmarkSummary({ job, result }: { job: SimulationJob; result: Result }) {
  const benchmark = job.request.benchmark
  const baseline = result.values[0]
  if (!benchmark || !baseline) return null
  const rows = benchmark.kinds.flatMap((kind, index) => { const value = result.values[index + 1]; return value ? [{ kind, value, comparison: compareSimulationValues(baseline, value) }] : [] })
  const reading = benchmarkReading(baseline, rows.map(row => ({ kind: row.kind, value: row.value })))
  const gain = (kind: BenchmarkKind) => rows.find(row => row.kind === kind)
  const gear = gain('gear'); const talents = gain('talents')
  // Name what matters most, only from measured gains that clear the uncertainty
  const meaningful = [gear, talents].filter(row => row && row.comparison.verdict === 'higher') as NonNullable<typeof gear>[]
  const biggest = [...meaningful].sort((a, b) => b.comparison.difference - a.comparison.difference)[0]
  const levels = benchmark.itemLevel
  const advice = !biggest ? 'Neither the top players\' items nor their talents measurably beat yours here, so gains now come from play rather than setup'
    : biggest.kind === 'gear' ? `Most of the gap is items${levels.average !== null && levels.yours !== null ? ` · Top players average item level ${level(levels.average)} and yours is ${level(levels.yours)}` : ''}`
    : 'Most of the gap is talents · Try the popular build below before chasing items'
  const tile = (row: (typeof rows)[number] | undefined, label: string) => row && <div className="plan-tile" data-tone={row.comparison.verdict === 'higher' ? 'up' : row.comparison.verdict === 'lower' ? 'down' : undefined}>
    <span>{label}</span>
    <strong>{row.comparison.verdict === 'unknown' ? 'Unknown' : row.comparison.verdict === 'sidegrade' ? 'About the same' : `${signed(row.comparison.difference)} DPS`}</strong>
    {row.comparison.verdict !== 'unknown' && row.comparison.verdict !== 'sidegrade' && <small>{percent(Math.abs(row.comparison.difference) / baseline.mean).replace(/^[+−]/, '')} {row.comparison.difference > 0 ? 'more' : 'less'} damage than your current setup</small>}
  </div>
  // Three numbers, the same shape as a plan reading; each run's damage taken is in the results below
  return <div className="plan-summary">
    <div className="plan-tiles">
      <div className="plan-tile"><span>Your setup against theirs</span><strong>{reading.matches ? 'Even' : `${Math.round(reading.share * 100)}%`}</strong><small>{advice}</small></div>
      {tile(gear, "Their gear on you")}
      {tile(talents, "Their talents on you")}
    </div>
    {!benchmark.kinds.includes('gear') && <p className="muted">You already wear the items most top players wear at their item level</p>}
    {!benchmark.kinds.includes('talents') && <p className="muted">You already use the most popular talent build, or no build is shared by several top players</p>}
    <details className="simulation-details"><summary>What was tested</summary>
      <ul>
        {benchmark.swapped.map(item => <li key={item.slot}>{slotNames[item.slot] ?? item.slot}: {item.from === item.to ? `${item.to} raised to item level ${item.itemLevel}` : `${item.from} → ${item.to} at item level ${item.itemLevel}`}</li>)}
        {benchmark.talentPlayers !== null && <li>Talents: the most popular build, used by {benchmark.talentPlayers} of the sampled players</li>}
        {benchmark.skipped.map(reason => <li key={reason}>{reason}</li>)}
      </ul>
      <p>{benchmark.population} · Their items run at the highest level any of them wears{benchmark.cap ? `, capped at item level ${benchmark.cap}, the top regular upgrade rank, since few players reach the ascension levels above it` : ''} · Your enchants and gems are kept on every item, so only items and talents change · Item bonuses such as extra sockets are not modeled</p>
    </details>
  </div>
}
