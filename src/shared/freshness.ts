/** How long ago something happened, in words, such as "3 hr ago"; one helper for every page */
export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return 'never'
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`
  const days = Math.floor(minutes / 1440)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export type GearFreshness = { state: 'fresh' | 'aging' | 'stale' | 'unknown'; at: string | null; text: string }

/**
 * How current the saved gear is: fresh within a day, aging within a week, stale after, and unknown when it was never
 * seen. Every page that reads gear (Plan, Best gear, Simulations, Key range) trusts it only as far as this says
 */
export function gearFreshness(character: { gearObservedAt?: string | null; observedAt?: string | null }, now = Date.now()): GearFreshness {
  const at = character.gearObservedAt ?? character.observedAt ?? null
  if (!at || Number.isNaN(Date.parse(at))) return { state: 'unknown', at: null, text: 'Gear not seen yet' }
  const hours = (now - Date.parse(at)) / 3_600_000
  const state = hours < 24 ? 'fresh' : hours < 24 * 7 ? 'aging' : 'stale'
  return { state, at, text: `Gear from ${ago(at, now)}` }
}
