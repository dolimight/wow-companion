import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../../components/ui/chart'
import { Card } from '../../components/ui/card'
import { simulationScenarios, type SimulationJob, type SimulationScenarioId } from '../../../shared/simulation'

const config = {
  current: { label: 'Your gear', color: 'var(--accent)' },
  best: { label: 'Best result tested', color: 'var(--green)' },
} satisfies ChartConfig
const compact = (value: number) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value))

/**
 * Your simulated damage across saved runs of one scenario, with the best setup each run tested above it. Different
 * scenarios aren't comparable, so only runs of the chosen one are drawn. Fills are flat, never gradients
 */
export function DamageHistory({ jobs, scenario }: { jobs: SimulationJob[]; scenario: SimulationScenarioId }) {
  const points = jobs
    .filter(job => job.state === 'completed' && job.result && job.request.scenarioId === scenario && job.result.values[0])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(job => {
      const values = job.result!.values
      return { at: new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), label: job.label, current: Math.round(values[0]!.mean), best: Math.round(Math.max(...values.map(value => value.mean))) }
    })
  if (points.length < 2) return null
  const low = Math.min(...points.map(point => point.current)), high = Math.max(...points.map(point => point.best))
  // Round the range to even steps so the axis reads 260k, 300k, 340k rather than odd endpoints
  const step = Math.max(10_000, Math.ceil((high - low) / 4 / 10_000) * 10_000)
  const floor = Math.max(0, Math.floor(low / step) * step - step), ceiling = Math.ceil(high / step) * step + step
  const ticks = Array.from({ length: Math.round((ceiling - floor) / step) + 1 }, (_, index) => floor + index * step)
  return (
    <Card className="simulation-section" role="region" aria-label="Damage over time">
      <div className="simulation-heading"><h2>Damage over time</h2><span className="muted small">{simulationScenarios[scenario].label} · {points.length} runs</span></div>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <AreaChart data={points} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="at" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compact} domain={[floor, ceiling]} ticks={ticks} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => { const point = payload?.[0]?.payload as (typeof points)[number] | undefined; return point ? `${point.at} · ${point.label}` : '' }} indicator="dot" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area dataKey="best" type="monotone" stroke="var(--color-best)" strokeWidth={2} fill="var(--color-best)" fillOpacity={0.1} dot={false} />
          <Area dataKey="current" type="monotone" stroke="var(--color-current)" strokeWidth={2} fill="var(--color-current)" fillOpacity={0.16} dot={false} />
        </AreaChart>
      </ChartContainer>
      <p className="muted small">Each point is one saved run · Your gear is what you wore then; the best result is the strongest setup that run tested</p>
    </Card>
  )
}
