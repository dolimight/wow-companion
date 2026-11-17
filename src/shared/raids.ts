import { dungeonKey, type JournalDifficulty, type StrategyNotes } from './dungeons'

export type RaidEncounter = { slug: string; name: string }
/** `art` is a path under public/assets to the raid's loading-screen art, bundled from the game files */
export type RaidInfo = { slug: string; name: string; shortName: string; startsAt: string | null; encounters: RaidEncounter[]; art?: string }
export type RaidList = { raids: RaidInfo[]; observedAt: string; source: string }

export type RaidDifficulty = Extract<JournalDifficulty, 'lfr' | 'normal' | 'heroic' | 'mythic'>
export const raidDifficulties: readonly RaidDifficulty[] = ['lfr', 'normal', 'heroic', 'mythic']
export const raidDifficultyLabels: Record<RaidDifficulty, string> = { lfr: 'Raid Finder', normal: 'Normal', heroic: 'Heroic', mythic: 'Mythic' }

/** Strategy for each raid boss, summarized from its guide; mythic lines show only on Mythic */
export type RaidBossStrategy = StrategyNotes & { encounterId: number; name: string; mythic?: string[] }
export type RaidStrategy = { raid: string; source: { name: string; url: string; updated: string }; bosses: RaidBossStrategy[] }
export type RaidStrategyFile = { season: string; raids: RaidStrategy[] }

/**
 * The raids that count this season: the newest full tier (three or more bosses) that has opened, plus every raid opened
 * since, such as one-boss lairs. Main tiers come first, then the rest by opening date
 */
export function seasonRaids(raids: RaidInfo[], now = Date.now()): RaidInfo[] {
  const open = raids.filter(raid => raid.startsAt && Date.parse(raid.startsAt) <= now)
  const tier = open.filter(raid => raid.encounters.length >= 3).sort((a, b) => Date.parse(b.startsAt!) - Date.parse(a.startsAt!))[0]
  if (!tier) return open
  const from = Date.parse(tier.startsAt!)
  return open.filter(raid => Date.parse(raid.startsAt!) >= from)
    .sort((a, b) => b.encounters.length - a.encounters.length || Date.parse(a.startsAt!) - Date.parse(b.startsAt!))
}

/** Raider.IO's kill summary for one raid, such as "3/8 H", read from the character's raiding label "slug: 3/8 H · …" */
export function raidSummary(label: string | null | undefined, slug: string): string | null {
  for (const part of (label ?? '').split(' · ')) {
    const at = part.indexOf(': ')
    if (at > 0 && part.slice(0, at) === slug) return part.slice(at + 2).trim() || null
  }
  return null
}

/** This week's lockouts for a raid, matched on its name since lockouts carry no id */
export function raidLockouts<T extends { name: string; raid?: boolean }>(lockouts: T[], raidName: string): T[] {
  return lockouts.filter(lockout => lockout.raid !== false && dungeonKey(lockout.name) === dungeonKey(raidName))
}
