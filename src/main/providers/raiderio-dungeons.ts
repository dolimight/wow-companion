import { z } from 'zod'
import { getJson, RaiderIoTopError } from './raiderio-top'
import type { DungeonList, DungeonRoutes } from '../../shared/dungeons'

const seasonSchema = z.object({
  slug: z.string(), name: z.string(), is_main_season: z.boolean().optional(), starts: z.record(z.string(), z.string().nullable()).optional(),
  dungeons: z.array(z.object({ slug: z.string(), name: z.string(), short_name: z.string().optional(), challenge_mode_id: z.number().int(), keystone_timer_seconds: z.number().positive() })).default([]),
})

/**
 * The current season's dungeons from the documented static data. Raider.IO files seasons under the expansion they
 * launched in, so both the newest expansions are checked and the newest started main season wins
 */
export async function fetchSeasonDungeons(signal?: AbortSignal): Promise<DungeonList> {
  const seasons: Array<z.infer<typeof seasonSchema>> = []
  for (const expansion of [12, 11]) {
    const parsed = z.object({ seasons: z.array(seasonSchema).default([]) }).safeParse(await getJson('/api/v1/mythic-plus/static-data', { expansion_id: String(expansion) }, signal).catch(() => null))
    if (parsed.success) seasons.push(...parsed.data.seasons)
  }
  const started = seasons.filter(season => season.is_main_season !== false && season.dungeons.length && season.starts?.us && Date.parse(season.starts.us) <= Date.now())
    .sort((a, b) => Date.parse(b.starts!.us!) - Date.parse(a.starts!.us!))
  const season = started[0]
  if (!season) throw new RaiderIoTopError("This season's dungeons are not available from Raider.IO")
  return {
    season: { slug: season.slug, name: season.name },
    dungeons: season.dungeons.map(dungeon => ({ slug: dungeon.slug, name: dungeon.name, shortName: dungeon.short_name ?? dungeon.name, challengeModeId: dungeon.challenge_mode_id, timerMs: dungeon.keystone_timer_seconds * 1000 })),
    observedAt: new Date().toISOString(),
    source: 'Raider.IO',
  }
}

const familiesSchema = z.object({
  totalEligibleRuns: z.number().int().nonnegative().optional(),
  families: z.array(z.object({
    familyId: z.string().max(200),
    anonymousRunCount: z.number().int().nonnegative(),
    timedRunCount: z.number().int().nonnegative(),
    medianClearTimeMs: z.number().nullable().optional(),
    fastestClearTimeMs: z.number().nullable().optional(),
    highestKeyLevel: z.number().int().nullable().optional(),
    latestCompletionAt: z.string().nullable().optional(),
    representative: z.object({ routeKey: z.string().regex(/^[A-Za-z0-9]{1,20}$/).nullable().optional() }).nullable().optional(),
  })).default([]),
})
const resourceSchema = z.object({
  timersMs: z.object({ plusOne: z.number().positive(), plusTwo: z.number().positive(), plusThree: z.number().positive() }).nullable().optional(),
  enemyForces: z.number().int().positive().nullable().optional(),
  bosses: z.array(z.object({ iconUrl: z.string().nullable().optional() })).default([]),
})

/**
 * The routes players run in a dungeon, grouped by Raider.IO from real runs, plus its timers, enemy forces, and bosses.
 * These come from the endpoints Raider.IO's own routes page uses, which are undocumented, so the caller shows a clear
 * error rather than guessing when they change
 */
export async function fetchDungeonRoutes(season: string, dungeon: string, signal?: AbortSignal): Promise<DungeonRoutes> {
  const params = { season, dungeon }
  const [families, resource] = await Promise.all([
    getJson('/api/mythic-plus/routes/popular', params, signal).then(value => familiesSchema.safeParse(value)),
    getJson('/api/mythic-plus/routes/dungeon-resource', params, signal).then(value => resourceSchema.safeParse(value)).catch(() => null),
  ])
  if (!families.success) throw new RaiderIoTopError('Raider.IO changed its routes data; routes are unavailable for now')
  const extra = resource?.success ? resource.data : null
  return {
    season, dungeon,
    totalRuns: families.data.totalEligibleRuns ?? null,
    timersMs: extra?.timersMs ?? null,
    enemyForces: extra?.enemyForces ?? null,
    // Boss icons are named after their journal encounter, such as /images/wow/encounter-journal/2776.png
    encounterIds: (extra?.bosses ?? []).flatMap(boss => { const id = Number(boss.iconUrl?.match(/encounter-journal\/(\d+)\./)?.[1]); return id > 0 ? [id] : [] }),
    families: families.data.families.slice(0, 12).map(family => ({
      familyId: family.familyId,
      runs: family.anonymousRunCount,
      timed: family.timedRunCount,
      medianClearMs: family.medianClearTimeMs ?? null,
      fastestClearMs: family.fastestClearTimeMs ?? null,
      highestKey: family.highestKeyLevel ?? null,
      latestAt: family.latestCompletionAt ?? null,
      routeKey: family.representative?.routeKey ?? null,
    })),
    observedAt: new Date().toISOString(),
    source: 'Raider.IO',
  }
}
