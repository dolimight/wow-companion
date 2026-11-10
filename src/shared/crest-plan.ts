import evidence from '../../data/season-rules/client-evidence.json'
import type { GearItem, GearSlot } from './domain'
import type { SeasonRuleset } from './season-rules'

type Track = SeasonRuleset['upgradeTracks'][number]
type BonusRank = { trackId: string; rank: number; itemLevel: number }
const bonusRanks = evidence.bonusRanks as Record<string, BonusRank>

export type CrestStep = {
  slot: GearSlot
  name: string
  track: string
  fromLevel: number
  toLevel: number
  gain: number
  /** The crest this rank costs, or null when the rank costs no crest */
  crestId: string | null
  crests: number
  gold: number
  /** Item levels gained for each crest spent; ranks that cost no crest sort first */
  perCrest: number
  discountPossible: boolean
}
export type CrestTotal = { currencyId: string; balance: number | null; next: number; full: number }
export type CrestPlan = { steps: CrestStep[]; affordable: CrestStep[]; totals: CrestTotal[]; unknownSlots: GearSlot[] }

/** The upgrade track and rank of an equipped item, from its own fields or from the game build's bonus IDs */
export function upgradeTrackOf(item: Pick<GearItem, 'upgradeTrackId' | 'upgradeRank' | 'bonusIds' | 'itemLevel'>) {
  if (item.upgradeTrackId && item.upgradeRank != null) return { trackId: item.upgradeTrackId, rank: item.upgradeRank }
  const matches = (item.bonusIds ?? []).map(bonus => bonusRanks[String(bonus)]).filter((value): value is BonusRank => !!value)
  return matches.length === 1 && matches[0]!.itemLevel === item.itemLevel ? { trackId: matches[0]!.trackId, rank: matches[0]!.rank } : null
}

const crestOf = (cost: Track['ranks'][number]['cost']) => cost?.find(entry => entry.currencyId !== 'money') ?? null

/**
 * Next upgrade for every equipped item, ranked by item levels per crest, plus the crests needed to finish every track
 * Costs are the season's base prices; a rank you have reached before on that slot can cost less in game
 */
export function crestPlan(gear: GearItem[], tracks: Track[], currencies: Record<string, number> | null): CrestPlan {
  const steps: CrestStep[] = []
  const totals = new Map<string, CrestTotal>()
  // Every crest of the season is listed, held balance included, even when no equipped item needs it right now
  for (const track of tracks) {
    for (const rank of track.ranks) {
      const crest = crestOf(rank.cost)
      if (crest && !totals.has(crest.currencyId)) totals.set(crest.currencyId, { currencyId: crest.currencyId, balance: currencies?.[crest.currencyId] ?? null, next: 0, full: 0 })
    }
  }
  const unknownSlots: GearSlot[] = []
  for (const item of gear) {
    const position = upgradeTrackOf(item)
    const track = position ? tracks.find(entry => entry.id === position.trackId) : null
    if (!position || !track) { if (item.itemId) unknownSlots.push(item.slot); continue }
    const ranks = [...track.ranks].sort((a, b) => a.rank - b.rank)
    const current = ranks.find(rank => rank.rank === position.rank)
    const remaining = ranks.filter(rank => rank.rank > position.rank)
    if (!current || !remaining.length) continue
    for (const [index, rank] of remaining.entries()) {
      const crest = crestOf(rank.cost)
      if (!crest) continue
      const total = totals.get(crest.currencyId) ?? { currencyId: crest.currencyId, balance: currencies?.[crest.currencyId] ?? null, next: 0, full: 0 }
      total.full += crest.amount
      if (index === 0) total.next += crest.amount
      totals.set(crest.currencyId, total)
    }
    const next = remaining[0]!
    const crest = crestOf(next.cost)
    const gain = next.itemLevel - current.itemLevel
    steps.push({
      slot: item.slot, name: item.name, track: track.name, fromLevel: current.itemLevel, toLevel: next.itemLevel, gain,
      crestId: crest?.currencyId ?? null, crests: crest?.amount ?? 0,
      gold: (next.cost?.find(entry => entry.currencyId === 'money')?.amount ?? 0) / 10_000,
      perCrest: crest?.amount ? gain / crest.amount : Infinity,
      discountPossible: !!next.discountRequired,
    })
  }
  steps.sort((a, b) => b.perCrest - a.perCrest || b.gain - a.gain || a.slot.localeCompare(b.slot))
  // Spend the crests you hold on the best value upgrades first; one step per item, since the next rank costs again
  const left = new Map(Object.entries(currencies ?? {}))
  const affordable = currencies ? steps.filter(step => {
    if (!step.crestId) return true
    const balance = left.get(step.crestId) ?? 0
    if (balance < step.crests) return false
    left.set(step.crestId, balance - step.crests)
    return true
  }) : []
  return { steps, affordable, totals: [...totals.values()].sort((a, b) => a.currencyId.localeCompare(b.currencyId)), unknownSlots }
}
