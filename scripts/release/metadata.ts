import type { ReleaseChannel, ReleaseRecord } from './types.ts'

export const CHANNELS: readonly ReleaseChannel[] = ['stable', 'nightly']
export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return value === 'stable' || value === 'nightly'
}
const stablePattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export function stableVersion(version: string) {
  if (!stablePattern.test(version)) throw new Error('Expected a plain major.minor.patch version')
  return version
}
export function compareVersions(a: string, b: string) {
  const left = stableVersion(a).split('.').map(Number), right = stableVersion(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i]
  return 0
}
export function nightlyVersion(base: string, date: string, run: string | number | undefined) {
  stableVersion(base)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Expected a UTC timestamp')
  if (!/^[1-9]\d*$/.test(String(run))) throw new Error('Expected a positive workflow run number')
  const [major, minor, patch] = base.split('.')
  return `${major}.${minor}.${Number(patch) + 1}-nightly.${new Date(date).toISOString().slice(0, 10).replaceAll('-', '')}.${run}`
}
export function releaseChannel(tag: string): ReleaseChannel | null {
  if (/^v\d+\.\d+\.\d+$/.test(tag)) return 'stable'
  if (/^v\d+\.\d+\.\d+-nightly\.\d{8}\.[1-9]\d*$/.test(tag)) return 'nightly'
  return null
}
export function latestRelease(releases: ReleaseRecord[], channel: ReleaseChannel) {
  return releases.filter(r => !r.draft && r.published_at && releaseChannel(r.tag_name) === channel)
    .sort((a, b) => Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? ''))[0] ?? null
}
export function nightlyIsDue(previous: Pick<ReleaseRecord, 'published_at'> | null, comparison: string, now: string) {
  if (!previous) return true
  if (Date.parse(now) - Date.parse(previous.published_at ?? '') < 6 * 60 * 60 * 1000) return false
  return comparison === 'ahead'
}
export function promotedVersion(tag: string, override = '') {
  if (releaseChannel(tag) !== 'nightly') throw new Error('Stable promotion requires a published nightly tag')
  return stableVersion(override || tag.slice(1).split('-nightly.')[0])
}
export function noteSummary(subjects: string[]) {
  const clean = (s: string) => s.replace(/^(?:feat|fix)(?:\([^)]*\))?!?:\s*/i, '').replace(/\.+$/, '')
  const features = subjects.filter(s => /^feat(?:\([^)]*\))?!?:/i.test(s)).slice(0, 4).map(clean)
  const fixes = subjects.filter(s => /^fix(?:\([^)]*\))?!?:/i.test(s)).slice(0, 10).map(clean)
  return ['## Highlights', features.length ? features.map(s => `- ${s}`).join('\n') : 'Maintenance release · See the full changelog for details', ...(fixes.length ? ['## Fixes', fixes.map(s => `- ${s}`).join('\n')] : [])].join('\n\n')
}
