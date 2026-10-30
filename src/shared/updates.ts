export type UpdateChannel = 'stable' | 'nightly'
export type UpdateState = {
  currentVersion: string
  channel: UpdateChannel
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  availableVersion: string | null
  progress: number | null
  releaseNotes: string | null
  releaseUrl: string | null
  checkedAt: string | null
  error: string | null
  disabledReason: string | null
  blockers: string[]
}

export function isUpdateChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'nightly'
}

// Only the two release formats this app publishes can enter the updater
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-nightly\.(\d{8})\.(0|[1-9]\d*))?$/
export function releaseVersion(value: string) {
  const match = versionPattern.exec(value)
  if (!match) return null
  return { core: match.slice(1, 4).map(Number), nightly: match[4] ? [Number(match[4]), Number(match[5])] : null }
}
export function compareReleaseVersions(left: string, right: string): number | null {
  const a = releaseVersion(left), b = releaseVersion(right)
  if (!a || !b) return null
  for (let index = 0; index < 3; index++) if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  if (!a.nightly || !b.nightly) return a.nightly === b.nightly ? 0 : a.nightly ? -1 : 1
  for (let index = 0; index < 2; index++) if (a.nightly[index] !== b.nightly[index]) return a.nightly[index] > b.nightly[index] ? 1 : -1
  return 0
}
