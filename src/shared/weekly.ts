import { z } from 'zod'

/**
 * Weekly reset anchors per region, taken from Raider.IO's published season start times
 * (static-data, Midnight Season 2). Resets repeat every 7 days at the same UTC time, and the
 * daily reset happens at the same UTC hour every day
 */
export const resetAnchors: Record<string, string> = {
  us: '2026-08-18T15:00:00Z',
  eu: '2026-08-19T04:00:00Z',
  kr: '2026-08-19T23:00:00Z',
  tw: '2026-08-19T23:00:00Z',
  cn: '2026-08-19T23:00:00Z',
}
const DAY = 86_400_000
const WEEK = 7 * DAY

export function hasResetSchedule(region: string) { return Object.hasOwn(resetAnchors, region.toLowerCase()) }
/** Start of the reset week containing `now`, or null when the region's schedule is unknown */
export function weekStart(region: string, now = Date.now()): number | null {
  const anchor = resetAnchors[region.toLowerCase()]
  if (!anchor) return null
  const start = Date.parse(anchor)
  return start + Math.floor((now - start) / WEEK) * WEEK
}
export function nextWeeklyReset(region: string, now = Date.now()) { const start = weekStart(region, now); return start == null ? null : start + WEEK }
export function nextDailyReset(region: string, now = Date.now()) {
  const anchor = resetAnchors[region.toLowerCase()]
  if (!anchor) return null
  const start = Date.parse(anchor)
  return start + (Math.floor((now - start) / DAY) + 1) * DAY
}

export const vaultKinds = ['raid', 'dungeon', 'world'] as const
export type VaultKind = (typeof vaultKinds)[number]
export const vaultNames: Record<VaultKind, string> = { raid: 'Raids', dungeon: 'Dungeons', world: 'Delves & world' }
/** Thresholds for the current season; the addon reports the live values and wins when present */
export const defaultVaultThresholds: Record<VaultKind, number[]> = { raid: [2, 4, 6], dungeon: [1, 4, 8], world: [2, 4, 8] }

const iso = z.string().datetime()
export const weeklySnapshotSchema = z.object({
  source: z.enum(['addon', 'Raider.IO', 'Blizzard']),
  observedAt: iso,
  /** Start of the reset week the snapshot describes */
  weekStart: iso,
  vault: z.array(z.object({ kind: z.enum(vaultKinds), index: z.number().int().min(1).max(5), threshold: z.number().int().nonnegative(), progress: z.number().int().nonnegative(), reward: z.string().max(60).nullable().default(null) })).max(15).default([]),
  /** Distinct bosses or runs counted toward the vault, best first, when the source lists them */
  raidKills: z.array(z.object({ boss: z.string().max(120), difficulty: z.string().max(40), rank: z.number().int() })).max(60).default([]),
  lockouts: z.array(z.object({ name: z.string().max(120), difficulty: z.string().max(60), killed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), raid: z.boolean().default(true) })).max(60).default([]),
  runs: z.array(z.object({ dungeon: z.string().max(120), level: z.number().int().nonnegative(), timed: z.boolean().nullable().default(null), completedAt: iso.nullable().default(null) })).max(60).default([]),
})
export type WeeklySnapshot = z.infer<typeof weeklySnapshotSchema>
export const weeklySchema = z.object({ addon: weeklySnapshotSchema.nullable().default(null), raiderio: weeklySnapshotSchema.nullable().default(null), blizzard: weeklySnapshotSchema.nullable().default(null) })
export type Weekly = z.infer<typeof weeklySchema>

export type VaultSlot = { threshold: number; unlocked: boolean; reward: string | null }
export type VaultTrack = { kind: VaultKind; label: string; progress: number | null; slots: VaultSlot[]; source: string | null; exact: boolean; remaining: number | null; note: string | null }

const raidDifficultyNames: Record<number, string> = { 17: 'Raid Finder', 14: 'Normal', 15: 'Heroic', 16: 'Mythic' }
/** Converts the game's raw vault level into words a new player can read */
export function vaultReward(kind: VaultKind, level: number | null | undefined) {
  if (level == null || level <= 0) return kind === 'dungeon' && level === 0 ? 'Mythic 0' : null
  if (kind === 'dungeon') return `Mythic +${level}`
  if (kind === 'raid') return raidDifficultyNames[level] ?? null
  return `Tier ${level}`
}

function current(snapshot: WeeklySnapshot | null | undefined, start: number | null) {
  return snapshot && start != null && Date.parse(snapshot.weekStart) === start ? snapshot : null
}

/** The addon's live vault wins; otherwise each track is estimated from the provider that observes it */
export function vaultTracks(weekly: Weekly | null | undefined, region: string, now = Date.now()): VaultTrack[] {
  const start = weekStart(region, now)
  const addon = current(weekly?.addon, start)
  const raiderio = current(weekly?.raiderio, start)
  const blizzard = current(weekly?.blizzard, start)
  return vaultKinds.map(kind => {
    const label = vaultNames[kind]
    const live = addon?.vault.filter(entry => entry.kind === kind).sort((a, b) => a.index - b.index) ?? []
    if (live.length) {
      const progress = Math.max(...live.map(entry => entry.progress))
      const slots = live.map(entry => ({ threshold: entry.threshold, unlocked: entry.progress >= entry.threshold, reward: entry.reward }))
      const next = slots.find(slot => !slot.unlocked)
      return { kind, label, progress, slots, source: 'the in-game Great Vault', exact: true, remaining: next ? next.threshold - progress : 0, note: null }
    }
    const thresholds = defaultVaultThresholds[kind]
    const estimate = (progress: number, rewardAt: (n: number) => string | null, source: string, note: string | null): VaultTrack => {
      const slots = thresholds.map(threshold => ({ threshold, unlocked: progress >= threshold, reward: progress >= threshold ? rewardAt(threshold) : null }))
      const next = slots.find(slot => !slot.unlocked)
      return { kind, label, progress, slots, source, exact: false, remaining: next ? next.threshold - progress : 0, note }
    }
    if (kind === 'dungeon' && raiderio) {
      const levels = raiderio.runs.map(run => run.level).sort((a, b) => b - a)
      return estimate(levels.length, n => vaultReward('dungeon', levels[n - 1]), 'Raider.IO', 'Raider.IO lists your highest runs this week, so lower runs may be missing')
    }
    if (kind === 'raid' && blizzard) {
      const kills = [...blizzard.raidKills].sort((a, b) => b.rank - a.rank)
      return estimate(kills.length, n => kills[n - 1]?.difficulty ?? null, 'Blizzard raid history', null)
    }
    const thresholdsOnly = thresholds.map(threshold => ({ threshold, unlocked: false, reward: null }))
    return { kind, label, progress: null, slots: thresholdsOnly, source: null, exact: false, remaining: null, note: kind === 'world' ? 'Delve and world progress is only visible through the in-game addon' : null }
  })
}

/** Lockouts from this reset week, preferring the addon's saved-instance list */
export function weeklyLockouts(weekly: Weekly | null | undefined, region: string, now = Date.now()) {
  const start = weekStart(region, now)
  const addon = current(weekly?.addon, start)
  if (addon?.lockouts.length) return { source: 'In-game saved instances', lockouts: addon.lockouts }
  const blizzard = current(weekly?.blizzard, start)
  if (blizzard) return { source: 'Blizzard raid history', lockouts: blizzard.lockouts }
  return { source: addon ? 'In-game saved instances' : null, lockouts: addon?.lockouts ?? [] }
}

export function weeklyRuns(weekly: Weekly | null | undefined, region: string, now = Date.now()) {
  const start = weekStart(region, now)
  const addon = current(weekly?.addon, start)
  if (addon?.runs.length) return { source: 'In-game run history', runs: addon.runs }
  const raiderio = current(weekly?.raiderio, start)
  return { source: raiderio ? 'Raider.IO' : addon ? 'In-game run history' : null, runs: raiderio?.runs ?? addon?.runs ?? [] }
}
