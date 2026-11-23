import { z } from 'zod'
import { getJson, RaiderIoTopError } from './raiderio-top'
import { seasonRaids, type RaidInfo, type RaidList } from '../../shared/raids'

const raidSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  name: z.string().min(1).max(120),
  short_name: z.string().max(40).optional(),
  starts: z.record(z.string(), z.string().nullable()).optional(),
  encounters: z.array(z.object({ slug: z.string().max(120), name: z.string().min(1).max(120) })).default([]),
})

/** Every raid of the newest expansions from Raider.IO's documented static data */
export async function fetchRaids(signal?: AbortSignal, expansions = [12, 11]): Promise<RaidInfo[]> {
  const raids: RaidInfo[] = []
  for (const expansion of expansions) {
    const parsed = z.object({ raids: z.array(raidSchema).default([]) }).safeParse(await getJson('/api/v1/raiding/static-data', { expansion_id: String(expansion) }, signal).catch(() => null))
    if (parsed.success) raids.push(...parsed.data.raids.map(raid => ({ slug: raid.slug, name: raid.name, shortName: raid.short_name ?? raid.name, startsAt: raid.starts?.us ?? null, encounters: raid.encounters.map(({ slug, name }) => ({ slug, name })) })))
  }
  return raids
}

/** This season's raids, newest tier first */
export async function fetchSeasonRaids(signal?: AbortSignal): Promise<RaidList> {
  const raids = seasonRaids(await fetchRaids(signal))
  if (!raids.length) throw new RaiderIoTopError("This season's raids are not available from Raider.IO")
  return { raids, observedAt: new Date().toISOString(), source: 'Raider.IO' }
}
