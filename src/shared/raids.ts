import { dungeonKey, type DungeonJournal, type JournalDifficulty, type StrategyNotes } from './dungeons'

export type RaidEncounter = { slug: string; name: string }
/**
 * `art` is a path under public/assets to the raid's loading-screen art, bundled from the game files. `journal` names the
 * raid whose bundled journal it shares, such as an Awakened raid and its original
 */
export type RaidInfo = { slug: string; name: string; shortName: string; startsAt: string | null; encounters: RaidEncounter[]; art?: string; journal?: string }
export type RaidList = { raids: RaidInfo[]; observedAt: string; source: string }

/** A Mythic+ season's window, from Raider.IO's static data */
export type SeasonWindow = { slug: string; name: string; startsAt: string; endsAt: string }
/** An ended season and the raids that were current in it */
export type RaidSeason = SeasonWindow & { raids: RaidInfo[] }
/** data/raids/history.json: the raids of every ended season in the last three expansions, bundled by scripts/raid-history.ts */
export type RaidHistory = { generatedAt: string; gameBuild: string; seasons: RaidSeason[] }
/** data/raids/encounters/history.json: those raids' bosses and loot at each difficulty, from the Encounter Journal */
export type RaidHistoryJournals = { generatedAt: string; gameBuild: string; raids: Record<string, Partial<Record<JournalDifficulty, DungeonJournal>>> }

/** A tier can open a week before its season's keys do */
const tierLead = 14 * 86_400_000

const expansionNames: Record<string, string> = { mn: 'Midnight', tww: 'The War Within', df: 'Dragonflight', sl: 'Shadowlands', bfa: 'Battle for Azeroth' }

/** The expansion a Raider.IO season slug belongs to, such as "tww" for "season-tww-3" */
export const seasonExpansion = (slug: string) => slug.match(/^season-([a-z]+)-\d+/)?.[1] ?? null

/** "The War Within Season 3" for "season-tww-3", keeping Raider.IO's own name for an expansion it doesn't know */
export function fullSeasonName(slug: string, name: string): string {
  const match = slug.match(/^season-([a-z]+)-(\d+)/)
  const expansion = match ? expansionNames[match[1]!] : undefined
  return expansion ? `${expansion} Season ${match![2]}` : name
}

/**
 * The seasons that have ended in the newest `expansions` expansions (the current one counts), newest first, each with
 * the raids that opened during it. Seasons without a raid, such as an event season, are skipped
 */
export function pastRaidSeasons(raids: RaidInfo[], seasons: SeasonWindow[], now = Date.now(), expansions = 3): RaidSeason[] {
  const newest = seasons.filter(season => Date.parse(season.startsAt) <= now).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  const kept = new Set<string>()
  for (const season of newest) {
    const key = seasonExpansion(season.slug)
    if (key && kept.size < expansions) kept.add(key)
  }
  return newest.filter(season => Date.parse(season.endsAt) <= now && kept.has(seasonExpansion(season.slug) ?? ''))
    .map(season => ({
      ...season,
      raids: raids.filter(raid => raid.startsAt && Date.parse(raid.startsAt) >= Date.parse(season.startsAt) - tierLead && Date.parse(raid.startsAt) < Date.parse(season.endsAt))
        .sort((a, b) => b.encounters.length - a.encounters.length || Date.parse(a.startsAt!) - Date.parse(b.startsAt!)),
    }))
    .filter(season => season.raids.length)
}

/** A URL slug for a raid named by the journal, such as "march-on-queldanas" */
export const raidSlug = (name: string) => name.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

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
