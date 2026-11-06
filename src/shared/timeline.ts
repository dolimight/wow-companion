import { z } from 'zod'
import type { Character } from './domain'

export const timelinePointSchema = z.object({ at: z.string().datetime(), itemLevel: z.number().nonnegative().nullable(), score: z.number().nonnegative().nullable(), season: z.string().max(60).nullable().default(null) })
export type TimelinePoint = z.infer<typeof timelinePointSchema>
export const timelineSchema = z.object({ schemaVersion: z.literal(1).default(1), points: z.array(timelinePointSchema).max(2000).default([]) })
export type Timeline = z.infer<typeof timelineSchema>
export const TIMELINE_NAMESPACE = 'timeline'

/** The values a character shows right now, as one timeline point */
export function timelinePoint(character: Pick<Character, 'itemLevel' | 'ratings'>, at: string): TimelinePoint {
  const score = character.ratings.mythicPlus?.value ?? null
  return { at, itemLevel: character.itemLevel != null ? Math.round(character.itemLevel * 10) / 10 : null, score: score != null ? Math.round(score * 10) / 10 : null, season: character.ratings.mythicPlus?.seasonId ?? null }
}

/** Adds a point only when item level, score, or season changed, so repeated syncs never pad the chart */
export function appendTimeline(timeline: Timeline | null, point: TimelinePoint): Timeline | null {
  const points = timeline?.points ?? []
  const last = points.at(-1)
  if (point.itemLevel == null && point.score == null) return null
  if (last && last.itemLevel === point.itemLevel && last.score === point.score && last.season === point.season) return null
  return { schemaVersion: 1, points: [...points, point].slice(-2000) }
}
