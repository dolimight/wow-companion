import { z } from 'zod'

/** One player's fight from a public Warcraft Logs report, reduced to the numbers a review needs, never raw events */
const abilityTotal = z.object({ name: z.string().max(200), total: z.number().nonnegative() })
export const fightSummarySchema = z.object({
  fightId: z.number().int().positive(), name: z.string().max(200), kill: z.boolean().nullable(), durationMs: z.number().nonnegative(),
  difficulty: z.number().int().nullable(), keystoneLevel: z.number().int().nullable(),
  damage: z.object({ total: z.number().nonnegative(), perSecond: z.number().nonnegative(), top: z.array(abilityTotal).max(10) }),
  taken: z.object({ total: z.number().nonnegative(), top: z.array(abilityTotal).max(10) }),
  casts: z.array(z.object({ name: z.string().max(200), count: z.number().int().nonnegative() })).max(15),
  deaths: z.array(z.object({ atMs: z.number(), killingBlow: z.string().max(200).nullable() })).max(10),
})
export type FightSummary = z.infer<typeof fightSummarySchema>

type TableEntry = { name?: unknown; total?: unknown; abilities?: unknown; timestamp?: unknown; killingBlow?: unknown }
const entriesOf = (table: unknown): TableEntry[] => { const entries = (table as { data?: { entries?: unknown } } | null)?.data?.entries; return Array.isArray(entries) ? entries.slice(0, 500) as TableEntry[] : [] }

/**
 * A Warcraft Logs table as ability totals, biggest first. A table filtered to one player can list that player with
 * an abilities breakdown, or the abilities directly; both shapes are read
 */
export function tableAbilities(table: unknown): Array<{ name: string; total: number }> {
  const entries = entriesOf(table)
  const rows = entries.length === 1 && Array.isArray(entries[0]!.abilities) ? (entries[0]!.abilities as TableEntry[]).slice(0, 500) : entries
  return rows.flatMap(row => typeof row.name === 'string' && typeof row.total === 'number' && Number.isFinite(row.total) && row.total >= 0 ? [{ name: row.name.slice(0, 200), total: row.total }] : [])
    .sort((a, b) => b.total - a.total)
}

/** The deaths of one player in a Deaths table, with when each happened in the fight and what killed them */
export function tableDeaths(table: unknown, player: string, fightStart: number): Array<{ atMs: number; killingBlow: string | null }> {
  return entriesOf(table).flatMap(entry => entry.name === player && typeof entry.timestamp === 'number' ? [{ atMs: entry.timestamp - fightStart, killingBlow: typeof (entry.killingBlow as { name?: unknown } | null)?.name === 'string' ? ((entry.killingBlow as { name: string }).name).slice(0, 200) : null }] : []).slice(0, 10)
}
