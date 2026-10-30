import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nightlyVersion, promotedVersion, nightlyIsDue, latestRelease, noteSummary, releaseChannel, compareVersions } from './metadata.ts'
test('nightly versions use UTC, the next patch, and unique workflow runs', () => {
  assert.equal(nightlyVersion('0.1.0', '2026-10-30T01:00:00Z', 42), '0.1.1-nightly.20261030.42')
  assert.notEqual(nightlyVersion('0.1.0', '2026-10-30T01:00:00Z', 43), nightlyVersion('0.1.0', '2026-10-30T01:00:00Z', 42))
  assert.throws(() => nightlyVersion('0.1.0-beta', '2026-10-30T01:00:00Z', 1))
  assert.throws(() => nightlyVersion('0.1.0', 'not-a-date', 1))
  assert.throws(() => nightlyVersion('0.1.0', '2026-10-30T01:00:00Z', 0))
})
test('stable promotion retains the nightly target, with validated overrides', () => {
  assert.equal(promotedVersion('v0.1.1-nightly.20261030.42'), '0.1.1')
  assert.equal(promotedVersion('v0.1.1-nightly.20261030.42', '0.2.0'), '0.2.0')
  assert.throws(() => promotedVersion('v0.1.1'))
  assert.throws(() => promotedVersion('v0.1.1-nightly.20261030.42', '0.2.0-beta'))
})
test('scheduled nightlies require six hours and new commits', () => {
  const previous = { published_at: '2026-10-30T01:00:00Z' }
  assert.equal(nightlyIsDue(previous, 'ahead', '2026-10-30T06:59:59Z'), false)
  assert.equal(nightlyIsDue(previous, 'ahead', '2026-10-30T07:00:00Z'), true)
  for (const status of ['identical', 'behind', 'diverged']) assert.equal(nightlyIsDue(previous, status, '2026-10-30T09:00:00Z'), false)
  assert.equal(nightlyIsDue(null, 'ahead', '2026-10-30T01:00:00Z'), true)
})
test('previous-release selection never crosses channels or includes drafts', () => {
  const releases = [{ tag_name: 'v0.1.0', published_at: '2026-10-29T01:00:00Z' }, { tag_name: 'v0.1.1-nightly.20261030.2', published_at: '2026-10-30T01:00:00Z' }, { tag_name: 'v0.2.0', published_at: '2026-10-30T02:00:00Z', draft: true }]
  assert.equal(latestRelease(releases, 'stable')?.tag_name, 'v0.1.0')
  assert.equal(latestRelease(releases, 'nightly')?.tag_name, 'v0.1.1-nightly.20261030.2')
  assert.equal(releaseChannel('v0.1.1-preview.1'), null)
  assert.equal(compareVersions('0.1.9', '0.1.10') < 0, true)
})
test('release summaries distinguish feature and fix commits from internal changes', () => {
  const summary = noteSummary(['feat(gear): Compare owned variants', 'fix(addon): Hide previews after login', 'chore: Update dependencies'])
  assert.match(summary, /## Highlights\n\n- Compare owned variants/)
  assert.match(summary, /## Fixes\n\n- Hide previews after login/)
  assert.doesNotMatch(summary, /dependencies/)
})
