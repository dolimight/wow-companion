import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Character, GearItem } from '../../../shared/domain'
import { projectStats } from '../../../shared/stat-projection'
import { errorMessage } from '../../lib/notify'
import { useGameData } from '../items/items'
import { StatsSurface } from '../week/week'
import { enhancementChoices, plannedRatings, type Enhancement } from './enhancement-data'

/** Slots whose enchant or gems differ from what's equipped; only those need their enhancement stats read */
function changedEnhancementSlots(character: Character, items: GearItem[]) {
  return items.filter(item => {
    const before = character.gear.find(gear => gear.slot === item.slot)
    return (before?.enchant ?? '') !== (item.enchant ?? '') || (before?.gems ?? []).join('|') !== item.gems.join('|')
  }).map(item => item.slot)
}

async function planStats(character: Character, items: GearItem[]) {
  const choices = new Map<string, Enhancement>()
  for (const slot of changedEnhancementSlots(character, items)) for (const choice of await enhancementChoices(slot)) choices.set(`${choice.kind}:${choice.name}`, choice)
  return plannedRatings(character, items, [...choices.values()], true)
}

/** The character sheet as it would read wearing the plan, from the synced stats and the plan's item, gem, and enchant changes */
export function PlanStats({ character, items, disabled, otherSpec = null }: {
  character: Character; items: GearItem[]; disabled: boolean
  /** The specialization the synced sheet was taken in, when the plan is for another one */
  otherSpec?: string | null
}) {
  const status = useGameData()
  const shape = items.map(item => [item.slot, item.itemId, item.itemLevel, item.enchant, item.gems.join('|')].join(':')).join(',')
  const plan = useQuery({
    queryKey: ['plan-stats', character.id, character.observedAt, shape],
    queryFn: () => planStats(character, items),
    enabled: status.data?.state === 'ready' && !!character.stats && !disabled,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: previous => previous,
  })
  const projected = useMemo(() => character.stats && plan.data ? projectStats(character.stats, { ratings: plan.data.delta, primary: plan.data.primary, stamina: plan.data.stamina }) : null, [character.stats, plan.data])
  if (!character.stats) return null
  const subtitle = plan.isError
    ? `Showing your synced sheet · ${errorMessage(plan.error)}`
    : !projected ? 'Working out the planned sheet…' : `With this plan, from ${character.stats.source}${character.stats.observedAt ? ` · ${new Date(character.stats.observedAt).toLocaleDateString()}` : ''}`
  // Rating and stamina carry over between specializations, but mastery and main-stat scaling don't
  const note = otherSpec ? ` · Based on your ${otherSpec} sheet, so mastery and main stat are rough for ${character.specName}` : ''
  return (
    <StatsSurface
      character={character}
      stats={projected?.stats}
      before={projected ? character.stats : undefined}
      heading="Planned stats"
      subtitle={subtitle + note}
      unknown={projected?.unknown}
      footer={<>
        {projected && plan.data?.skipped.length ? <p className="week-footnote">Not counted, because their effects aren't flat secondary stats: {[...new Set(plan.data.skipped)].join(', ')}</p> : null}
        <p className="week-footnote">Changes count each planned item, gem, and enchant against what you have equipped, then apply diminishing returns to the rating part of your synced sheet. Set bonuses, procs, and main-stat multipliers aren't included</p>
      </>}
    />
  )
}
