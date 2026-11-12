import { ClipboardList, Crown, ExternalLink, User } from 'lucide-react'
import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge } from '../../components/ui/primitives'

type Value = NonNullable<SimulationJob['result']>['values'][number]
type Player = NonNullable<NonNullable<SimulationJob['request']['plan']>['roster']>['players'][number] & { value: Value }
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`

/**
 * Every sampled top player simulated as they play, ranked with your plan among them. The strongest is compared slot by
 * slot below until you pick someone else
 */
export function Roster({ players, plan, subject, chosen, onChoose }: { players: Player[]; plan: Value; subject: string; chosen: string | null; onChoose: (name: string) => void }) {
  const rows = [...players.map(player => ({ kind: 'player' as const, player, mean: player.value.mean })), { kind: 'plan' as const, player: null, mean: plan.mean }].sort((a, b) => b.mean - a.mean)
  const rank = rows.findIndex(row => row.kind === 'plan') + 1
  const best = players[0]
  const ahead = players.filter(player => compareSimulationValues(plan, player.value).verdict === 'higher').length
  const behind = players.filter(player => compareSimulationValues(plan, player.value).verdict === 'lower').length
  return (
    <div className="sim-roster">
      <div className="sim-roster-head">
        <h4><Crown size={15} aria-hidden="true" />{subject} among {players.length} top players</h4>
        <span className="muted small">Ranks #{rank} of {rows.length} · {ahead} measurably stronger · {behind} measurably weaker · the rest within the uncertainty</span>
      </div>
      <Card size="sm" className="sim-roster-list" role="list" aria-label="Top players ranked by simulated damage">
        {rows.map((row, index) => {
          if (row.kind === 'plan') return (
            <div key="plan" role="listitem" className="sim-roster-row" data-plan="">
              <span className="sim-roster-rank">{index + 1}</span>
              <span className="sim-roster-name"><ClipboardList size={15} aria-hidden="true" /><strong>{subject}</strong></span>
              <span className="sim-roster-dps">{Math.round(plan.mean).toLocaleString()}<small> DPS</small></span>
              <span className="sim-roster-gap"><Badge tone="blue">You</Badge></span>
            </div>
          )
          const player = row.player
          // Their damage against the plan's, positive when they do more
          const gap = compareSimulationValues(plan, player.value)
          const tone = gap.verdict === 'higher' ? 'amber' : gap.verdict === 'lower' ? 'green' : 'neutral'
          const selected = chosen === player.name
          return (
            <div key={player.name} role="listitem" className="sim-roster-row" data-selected={selected ? '' : undefined}>
              <span className="sim-roster-rank">{index + 1}</span>
              <button type="button" className="sim-roster-name" aria-pressed={selected} onClick={() => onChoose(player.name)} title={`Compare ${subject.toLowerCase()} with ${player.name} slot by slot`}>
                {player === best ? <Crown size={15} aria-hidden="true" className="sim-roster-best" /> : <User size={15} aria-hidden="true" />}
                <strong>{player.name}</strong>
                <small className="muted">{player.realm}{player.score != null ? ` · ${Math.round(player.score).toLocaleString()} score` : ''}{player.loadout ? '' : ' · ran with your talents'}</small>
              </button>
              <span className="sim-roster-dps">{Math.round(player.value.mean).toLocaleString()}<small> DPS</small></span>
              <span className="sim-roster-gap">
                <Badge tone={tone}>{gap.verdict === 'unknown' ? 'Unknown' : gap.verdict === 'sidegrade' ? 'Even with yours' : `${signed(gap.difference)} vs yours`}</Badge>
                <button type="button" className="sim-roster-link" aria-label={`Open ${player.name} on Raider.IO`} onClick={() => void api.openExternal(player.url).catch(error => notify(errorMessage(error)))}><ExternalLink size={13} /></button>
              </span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
