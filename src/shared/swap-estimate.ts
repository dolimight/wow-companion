import type { CharacterStats } from './domain'
import { diminishing, drBrackets, effectiveFromRaw } from './diminishing'
import { compareStats, parseStat, type StatChange } from './stat-lines'

type Line = { text: string; secondary: boolean }
export type SwapSide = { lines: Line[]; level: number | null; baseLevel: number | null }

export type DrChange = {
  name: string
  ratingChange: number
  before: number
  after: number
  /** Change in the displayed percentage once diminishing returns are applied */
  change: number
  /** Share of the change that survives diminishing returns (1 = all of it) */
  kept: number
  bracketBefore: number
  bracketAfter: number
}

export type SwapEstimate = {
  rows: StatChange[]
  dr: DrChange[]
  verdict: 'better' | 'worse' | 'mixed'
  reasons: string[]
  /** Growth in stats per item level, learned from your own equipped item */
  scale: number
}

const percentKeys = [
  { name: 'Critical Strike', key: 'crit' },
  { name: 'Haste', key: 'haste' },
  { name: 'Versatility', key: 'versatility' },
] as const
const primaryNames = new Set(['strength', 'agility', 'intellect'])
const sum = (lines: Line[]) => lines.reduce((total, line) => { const stat = parseStat(line.text); return stat && stat.name.toLowerCase() !== 'armor' ? total + stat.value : total }, 0)
const scaleLine = (line: Line, factor: number): Line => {
  const stat = parseStat(line.text)
  return stat ? { ...line, text: `${stat.value < 0 ? '-' : '+'}${Math.round(Math.abs(stat.value) * factor)} ${stat.name}` } : line
}

/**
 * Estimates what swapping the equipped item for another does, learning how stats grow with item level
 * from the equipped item (exact stats against its base stats) and applying diminishing returns to the character's real totals.
 * It needs the character's ratings, so it returns null until a sync has recorded them
 */
export function estimateSwap(input: { stats: CharacterStats | null; mine: SwapSide & { baseLines: Line[] }; top: SwapSide }): SwapEstimate | null {
  const { stats, mine, top } = input
  const exact = sum(mine.lines)
  const base = sum(mine.baseLines)
  if (!mine.level || !mine.baseLevel || mine.level <= mine.baseLevel || exact <= 0 || base <= 0) return null
  const scale = Math.log(exact / base) / (mine.level - mine.baseLevel)
  if (!Number.isFinite(scale) || scale <= 0) return null
  const factor = top.level && top.baseLevel ? Math.exp(scale * (top.level - top.baseLevel)) : 1
  const topLines = top.lines.map((line) => (/armor/i.test(line.text) ? line : scaleLine(line, factor)))
  const rows = compareStats(mine.lines, topLines)

  const dr: DrChange[] = []
  for (const { name, key } of percentKeys) {
    const rating = stats?.ratings?.[key]
    const shown = stats?.[key]
    // The game reports the percentage its rating gives after penalties, so no base value has to be guessed
    const fromRating = stats?.ratingBonus?.[key]
    const row = rows.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    if (!rating || shown == null || fromRating == null || !row || row.delta === 0) continue
    const current = diminishing(Math.max(0, fromRating))
    if (current.raw <= 0) continue
    const perPoint = rating / current.raw
    const rawAfter = Math.max(0, current.raw + row.delta / perPoint)
    const gained = effectiveFromRaw(rawAfter) - fromRating
    const after = shown + gained
    const linear = row.delta / perPoint
    const reading = diminishing(Math.max(0, fromRating + gained))
    dr.push({ name, ratingChange: row.delta, before: shown, after, change: gained, kept: Math.abs(linear) > 1e-9 ? (after - shown) / linear : 1, bracketBefore: current.bracket, bracketAfter: reading.bracket })
  }

  const primary = rows.filter((row) => primaryNames.has(row.name.toLowerCase())).reduce((total, row) => total + row.delta, 0)
  const net = dr.reduce((total, entry) => total + entry.change, 0)
  const mastery = rows.find((row) => /mastery/i.test(row.name))?.delta ?? 0
  const reasons: string[] = []
  if (primary) reasons.push(`${primary > 0 ? 'More' : 'Less'} of your main stat`)
  for (const entry of dr) {
    if (entry.bracketAfter > entry.bracketBefore && entry.kept < 0.95 && entry.change > 0) reasons.push(`${entry.name} moves into a ${Math.round(drBrackets[entry.bracketAfter]!.penalty * 100)}% penalty bracket, so only ${Math.round(entry.kept * 100)}% of the gain counts`)
    else if (entry.change < -0.05) reasons.push(`${entry.name} drops by ${Math.abs(entry.change).toFixed(1)}%`)
    else if (entry.change > 0.05) reasons.push(`${entry.name} rises by ${entry.change.toFixed(1)}%`)
  }
  if (mastery) reasons.push(`Mastery ${mastery > 0 ? 'up' : 'down'} ${Math.abs(Math.round(mastery)).toLocaleString()} rating`)
  const verdict = primary > 0 && net >= -0.2 ? 'better' : primary < 0 && net <= 0.2 ? 'worse' : primary === 0 && net > 0.1 ? 'better' : primary === 0 && net < -0.1 ? 'worse' : 'mixed'
  return { rows, dr, verdict, reasons, scale }
}
