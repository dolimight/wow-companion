/** Mythic+ dungeons for the season: the list, the routes players actually run, and each boss from the Dungeon Journal */
import type { ItemPrimaryStat } from './gamedata'

export type SeasonDungeonInfo = {
  slug: string
  name: string
  shortName: string
  challengeModeId: number
  /** The keystone timer for +1 */
  timerMs: number
  /** Bundled art under the app's assets folder, such as dungeons/den-of-nalorakk.jpg */
  art?: string | null
  /** Where the art was downloaded from, kept for the bundling script */
  artUrl?: string | null
}
export type DungeonList = { season: { slug: string; name: string; endsAt?: string | null }; dungeons: SeasonDungeonInfo[]; observedAt: string; source: string }

/**
 * A season's dungeon data downloaded ahead of time by scripts/dungeon-data.ts, since almost none of it changes during a
 * season: the dungeons, their timers, enemy forces, boss order, enemies, and a snapshot of the routes players run
 */
export type DungeonBundle = {
  season: { slug: string; name: string; endsAt: string | null }
  generatedAt: string
  dungeons: Array<SeasonDungeonInfo & { routes: DungeonRoutes | null; enemies: DungeonEnemies | null; pulls?: Record<string, RoutePull[]> }>
  /** The season's raids from Raider.IO, for the Raids page */
  raids?: Array<{ slug: string; name: string; shortName: string; startsAt: string | null; encounters: Array<{ slug: string; name: string }>; art?: string }>
}

/** Runs that followed the same route, grouped by Raider.IO */
export type RouteFamily = {
  familyId: string
  runs: number
  timed: number
  medianClearMs: number | null
  fastestClearMs: number | null
  highestKey: number | null
  latestAt: string | null
  /** The Keystone Guru route that draws this family, when Raider.IO has made one */
  routeKey: string | null
}
export type DungeonRoutes = {
  season: string
  dungeon: string
  totalRuns: number | null
  timersMs: { plusOne: number; plusTwo: number; plusThree: number } | null
  enemyForces: number | null
  /** Dungeon Journal encounter IDs in the order Raider.IO lists the bosses */
  encounterIds: number[]
  families: RouteFamily[]
  observedAt: string
  source: string
}

export type JournalRole = 'tank' | 'healer' | 'damage'
export type JournalFlag = 'tank' | 'damage' | 'healer' | 'heroic' | 'deadly' | 'important' | 'interruptible' | 'magic' | 'curse' | 'poison' | 'disease' | 'enrage' | 'mythic' | 'bleed'
export type JournalAbility = { id: number; name: string; text: string; icon: number | null; flags: JournalFlag[]; children: JournalAbility[] }
export type JournalBoss = {
  encounterId: number
  name: string
  description: string
  portrait: number | null
  /** Blizzard's own advice per role from the journal's overview */
  tips: Array<{ role: JournalRole; text: string }>
  overview: string
  abilities: JournalAbility[]
  /** What the boss can drop, from the journal's loot table */
  loot?: LootItem[]
}
export type DungeonJournal = { instanceId: number; name: string; description: string; button: number | null; background: number | null; bosses: JournalBoss[]; difficultyIds?: number[] }

/** The journal's icon flag bits, as the game's Encounter Journal shows them */
export const journalFlagBits: Array<[number, JournalFlag]> = [
  [1, 'tank'], [2, 'damage'], [4, 'healer'], [8, 'heroic'], [16, 'deadly'], [32, 'important'], [64, 'interruptible'],
  [128, 'magic'], [256, 'curse'], [512, 'poison'], [1024, 'disease'], [2048, 'enrage'], [4096, 'mythic'], [8192, 'bleed'],
]
export const journalFlags = (bits: number): JournalFlag[] => journalFlagBits.filter(([bit]) => (bits & bit) !== 0).map(([, flag]) => flag)

/**
 * Journal text with the game's markup turned into plain text: spell links keep their names, bullets become bullets, and
 * difficulty-gated passages ($[23,8 …$], $[!23,8 …$]) are kept only when they apply to Mythic+ (difficulty 8)
 */
export function journalText(raw: string, difficulty = 8): string {
  let text = raw
  // Innermost conditionals first, so nested ones resolve
  for (let guard = 0; guard < 10 && /\$\[/.test(text); guard++) {
    // A body may hold other tokens such as $bullet, just not another passage
    text = text.replace(/\$\[(!?)([\d,]+)\s?((?:(?!\$\[|\$\])[\s\S])*?)\$\]/g, (_, not: string, ids: string, body: string) => {
      // Keys are Mythic dungeons, so Mythic-only text (23) applies to them too
      const listed = ids.split(',').map(id => Number(id.trim())).some(id => id === difficulty || (difficulty === 8 && id === 23))
      return (not ? !listed : listed) ? body : ''
    })
  }
  return text
    .replace(/\|c[0-9a-fA-F]{8}\|H[^|]*\|h\[([^\]]*)\]\|h\|r/g, '$1')
    .replace(/\|H[^|]*\|h\[([^\]]*)\]\|h/g, '$1')
    .replace(/\|c[0-9a-fA-F]{8}|\|r/g, '')
    .replace(/\$bullet;?/g, '•')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The spell data journal text needs: names, descriptions, durations, and tick periods */
export type JournalSpell = { name: string; description: string; durationMs: number | null; effects: Array<{ index: number; periodMs: number; basePoints?: number }> }

const seconds = (ms: number) => { const s = ms / 1000; return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${Number(s.toFixed(1))} sec` }

/**
 * Fills a boss spell's tokens. Damage and healing amounts are scaled by the server for each key level, and the game files
 * hold only placeholders, so amounts are left out instead of shown wrong. Percentages (health thresholds, slows) are real
 * values and are kept, as are names, linked descriptions, durations, and tick periods
 */
export function journalSpellText(raw: string, self: number, spells: Map<number, JournalSpell>, depth = 0): string {
  const spell = (id: string | undefined) => spells.get(id ? Number(id) : self)
  // $?DIFF8|DIFF23[on Mythic][otherwise]: difficulty checks are answered for Mythic+, anything else takes the fallback
  let text = raw.replace(/\$\?([!\w|?]+)\[([^\]]*)\]\[([^\]]*)\]/g, (_, condition: string, yes: string, no: string) => {
    const met = condition.split('|').some(part => { const term = part.replace(/^\?/, ''), negate = term.startsWith('!'), match = term.replace(/^!/, '').match(/^DIFF(\d+)$/i); if (!match) return false; const hit = ['8', '23'].includes(match[1]!); return negate ? !hit : hit })
    return met ? yes : no
  })
  text = text
    .replace(/\$@spelldesc(\d+)/g, (_, id: string) => depth < 3 && spells.has(Number(id)) ? journalSpellText(spells.get(Number(id))!.description, Number(id), spells, depth + 1) : '')
    .replace(/\$@spellname(\d+)/g, (_, id: string) => spells.get(Number(id))?.name ?? '')
    .replace(/\$(\d*)t(\d)/g, (match, id: string, index: string) => { const period = spell(id)?.effects.find(effect => effect.index === Number(index) - 1)?.periodMs; return period ? String(Number((period / 1000).toFixed(1))) : match })
    .replace(/\$(\d*)d\b/g, (match, id: string) => { const duration = spell(id)?.durationMs; return duration && duration > 0 ? seconds(duration) : match })
    .replace(/\$(\d*)[sSmM](\d)%/g, (match, id: string, index: string) => { const points = spell(id)?.effects.find(effect => effect.index === Number(index) - 1)?.basePoints; return points ? `${Math.abs(points)}%` : match })
  // Phrases built around a value the files can't give are dropped whole, then lone amounts
  text = text
    .replace(/\b(?:After|In|Within)\s+\$\d*d\b,?\s*/g, '')
    .replace(/\s*(?:for|over)\s+\$\d*d\b/g, '')
    .replace(/\s+within\s+\$\d*[aA]\d\s+yards?(\s+of\b)?/g, (_, of?: string) => of ? ' near' : ' nearby')
    .replace(/\s*every\s+\$\d*t\d\s+sec/g, ' periodically')
    .replace(/\s+by\s+\$\d*[sSmMwWoOaA]\d%?/g, '')
    .replace(/\$\d*[sSmMwWoOaAbBeExXqQ]\d+%?\s*/g, '')
    .replace(/\$[\w@]+/g, '')
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/ ([.,;:])/g, '$1').replace(/\(\s*\)/g, '').replace(/[ \t]+\n/g, '\n').trim()
  // A sentence that lost its opening phrase starts with a capital again
  return text.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
}

/** Ability titles in the files are often placeholders such as "Section 4"; the spell's own name replaces them */
export const placeholderTitle = (title: string) => !title.trim() || /^Section \d+$/i.test(title.trim())

/** Keystone Guru's public embed for a route, the same map Raider.IO shows */
export function routeEmbedUrl(dungeonSlug: string, routeKey: string) {
  const slug = encodeURIComponent(dungeonSlug), key = encodeURIComponent(routeKey)
  return `https://keystone.guru/route/${slug}/${key}/${slug}/embed?style=compact&showAffixes=0`
}
export function routeUrl(dungeonSlug: string, routeKey: string) {
  const slug = encodeURIComponent(dungeonSlug), key = encodeURIComponent(routeKey)
  return `https://keystone.guru/route/${slug}/${key}/${slug}`
}

/** Timers for +1, +2, and +3 from the dungeon's timer: 100%, 80%, and 60% of it */
export function keystoneTimers(timerMs: number) {
  return { plusOne: timerMs, plusTwo: Math.round(timerMs * 0.8), plusThree: Math.round(timerMs * 0.6) }
}

export function clock(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const total = Math.round(ms / 1000), minutes = Math.floor(total / 60), seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** The family most worth following: the most timed runs among those with a drawn route, then the most timed overall */
export function bestFamily(families: RouteFamily[]) {
  const ranked = [...families].sort((a, b) => b.timed - a.timed || b.runs - a.runs)
  return ranked.find(family => family.routeKey) ?? ranked[0] ?? null
}

/** Dungeon names compared loosely, since Raider.IO and the game sometimes differ in punctuation */
export const dungeonKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

const tankSpecs = new Set([250, 104, 268, 66, 73, 581])
const healerSpecs = new Set([65, 105, 256, 257, 264, 270, 1468])
/** The role a specialization plays, which picks the journal advice shown first */
export function specRole(specId: number | null | undefined): JournalRole {
  if (specId && tankSpecs.has(specId)) return 'tank'
  if (specId && healerSpecs.has(specId)) return 'healer'
  return 'damage'
}

/** A rough pace: each timer split evenly across the bosses, so boss N should die by N/bosses of it */
export function bossPace(timersMs: { plusOne: number; plusTwo: number; plusThree: number }, bossIndex: number, bosses: number) {
  const share = (bossIndex + 1) / Math.max(1, bosses)
  return { plusOne: Math.round(timersMs.plusOne * share), plusTwo: Math.round(timersMs.plusTwo * share), plusThree: Math.round(timersMs.plusThree * share) }
}

/**
 * Why an ability matters to a role, or null when it doesn't need that role's attention. Deadly and important mechanics
 * matter to everyone; then each role's own work: tanks take tank-flagged hits, healers dispel and heal through the
 * marked damage, and damage dealers interrupt and soothe
 */
export function whyItMatters(flags: JournalFlag[], role: JournalRole): string | null {
  if (flags.includes('deadly')) return 'Deadly'
  if (role === 'tank' && flags.includes('tank')) return 'Tank'
  if (role === 'healer' && (['magic', 'curse', 'poison', 'disease'] as const).some(flag => flags.includes(flag))) return 'Dispel'
  if (role === 'healer' && flags.includes('healer')) return 'Healing'
  if (role !== 'healer' && flags.includes('interruptible')) return 'Interrupt'
  if (role === 'damage' && flags.includes('damage')) return 'Damage'
  if (role !== 'healer' && flags.includes('enrage')) return 'Soothe'
  if (flags.includes('important')) return 'Important'
  return null
}

/** An enemy in a dungeon, from Keystone Guru's public dungeon data */
export type DungeonEnemy = {
  npcId: number
  name: string
  /** Flagged by Keystone Guru's curators as an enemy to respect */
  dangerous: boolean
  kind: 'caster' | 'melee' | 'ranged' | 'healer' | 'other'
  elite: boolean
  boss: boolean
  health: number | null
  /** Enemy forces one kill gives, and its share of the dungeon's total */
  forces: number | null
  /** The spells it casts, from Mythic Dungeon Tools' dungeon data; their text comes from the game files */
  spells?: EnemySpellRef[]
  /** Whether stuns work on it, from the same data */
  stunnable?: boolean
  /** Its creature model, and a bundled render of it under public/assets */
  displayId?: number
  image?: string
}
export type SpellTag = 'magic' | 'curse' | 'poison' | 'disease' | 'bleed' | 'enrage'
export const spellTags: readonly SpellTag[] = ['magic', 'curse', 'poison', 'disease', 'bleed', 'enrage']
/** Which difficulty's journal sections to read: dungeons use Mythic+ (8) with Mythic (23); raids their own difficulty */
export type JournalDifficulty = 'mythicPlus' | 'lfr' | 'normal' | 'heroic' | 'mythic'
export const journalDifficulties: readonly JournalDifficulty[] = ['mythicPlus', 'lfr', 'normal', 'heroic', 'mythic']
export const journalDifficultyIds: Record<JournalDifficulty, number[]> = { mythicPlus: [8, 23], lfr: [17], normal: [14], heroic: [15], mythic: [16] }
export type EnemySpellRef = { id: number; interrupt: boolean; tags?: SpellTag[] }
export type EnemySpell = { id: number; name: string; text: string; icon: number | null }

/** Strategy written for the app from the season's dungeon guides, in short lines per role */
export type StrategyNotes = { positioning?: string[]; everyone?: string[]; tank?: string[]; healer?: string[]; damage?: string[]; mythic?: string[] }
export type BossStrategy = StrategyNotes & { encounterId: number; name: string }
export type EnemyStrategy = StrategyNotes & { npcId: number; name: string; threat: string }
export type DungeonStrategy = { dungeon: string; source: { name: string; url: string; updated: string }; bosses: BossStrategy[]; enemies: EnemyStrategy[] }
export type StrategyFile = { season: string; dungeons: DungeonStrategy[] }

/** The lines one role reads: where to stand, what everyone does, then the role's own jobs */
export function strategyFor(notes: StrategyNotes | undefined, role: JournalRole) {
  return { positioning: notes?.positioning ?? [], everyone: notes?.everyone ?? [], mine: notes?.[role] ?? [] }
}
export type DungeonEnemies = { dungeon: string; forcesRequired: number | null; enemies: DungeonEnemy[]; observedAt: string; source: string }

/** Why an enemy needs a role's attention */
export function enemyNote(enemy: DungeonEnemy, role: JournalRole): string | null {
  if (enemy.dangerous) return 'Dangerous'
  if (enemy.kind === 'caster' && role !== 'healer') return 'Interrupt'
  if (enemy.kind === 'healer' && role !== 'healer') return 'Interrupt its heals'
  return null
}

export const wowheadNpcUrl = (npcId: number) => `https://www.wowhead.com/npc=${npcId}`

/** An item from a boss's journal loot, with what a compatibility check needs */
export type LootItem = {
  id: number
  name: string
  quality: number
  slot: string
  inventoryType: number
  armor: string | null
  icon: number | null
  requiredLevel: number
  classId?: number
  subclassId?: number
  allowableClassMask?: number | null
  specIds?: number[] | null
  primaryStats?: ItemPrimaryStat[] | null
}

/**
 * Boss text, loot, and enemy spells read from the game files ahead of time by scripts/encounter-data.ts, so the pages
 * work without the player's install; the icons it names are bundled under public/assets/icons
 */
export type EncounterBundle = {
  season: string
  gameBuild: string
  generatedAt: string
  dungeons: Record<string, DungeonJournal>
  raids: Record<string, Partial<Record<JournalDifficulty, DungeonJournal>>>
  spells: Record<number, EnemySpell>
}

/** One pull of a Keystone Guru route: each NPC in it and how many of them */
export type RoutePull = Array<[npcId: number, count: number]>

/** A pull of trash before a boss, numbered as the route numbers it */
export type PullGroup = { pull: number; npcs: Array<{ npcId: number; count: number }> }

/**
 * Splits a route's pulls at each boss: a pull with a boss NPC ends that boss's stretch. Boss pulls are matched to the
 * journal by name, then by order, so a route that kills bosses out of order still lists the right trash
 */
export function pullsBeforeBosses(pulls: RoutePull[], enemies: DungeonEnemy[], bosses: Array<Pick<JournalBoss, 'encounterId' | 'name'>>): Map<number, PullGroup[]> {
  const byId = new Map(enemies.map(enemy => [enemy.npcId, enemy]))
  const result = new Map<number, PullGroup[]>()
  const left = [...bosses]
  let trash: PullGroup[] = []
  pulls.forEach((pull, index) => {
    const bossNpcs = pull.filter(([npcId]) => byId.get(npcId)?.boss)
    const npcs = pull.filter(([npcId]) => !byId.get(npcId)?.boss).map(([npcId, count]) => ({ npcId, count }))
    if (npcs.length) trash.push({ pull: index + 1, npcs })
    if (!bossNpcs.length || !left.length) return
    const names = bossNpcs.map(([npcId]) => dungeonKey(byId.get(npcId)!.name))
    const named = left.findIndex(boss => { const key = dungeonKey(boss.name); return names.some(name => key.includes(name) || name.includes(key)) })
    const boss = left.splice(named >= 0 ? named : 0, 1)[0]!
    result.set(boss.encounterId, trash)
    trash = []
  })
  // Routes often stop before the last boss, so trash after the final boss pull leads to the next boss still standing
  if (trash.length && left.length) result.set(left[0]!.encounterId, trash)
  return result
}
