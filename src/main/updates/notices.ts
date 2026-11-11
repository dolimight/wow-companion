import type { UpdateState } from '../../shared/updates'

export type UpdateNotice = { key: string; title: string; body: string }

/**
 * The desktop notice an update state change deserves, if any. Keys carry the version so the regular background
 * check, which briefly clears the found version, never repeats a notice
 */
export function updateNotice(previous: UpdateState | null, next: UpdateState): UpdateNotice | null {
  const version = next.availableVersion
  if (!version || previous?.status === next.status) return null
  if (next.status === 'available' && !next.autoDownload) return { key: `available:${version}`, title: 'A WOW Companion update is available', body: `Version ${version} is ready to download from Updates` }
  if (next.status === 'ready') return { key: `ready:${version}`, title: 'WOW Companion update ready', body: `Restart to finish updating to ${version}` }
  return null
}
