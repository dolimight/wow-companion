import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { CHANNELS, compareVersions, latestRelease, nightlyIsDue, nightlyVersion, promotedVersion, releaseChannel, stableVersion } from './metadata.mjs'

// GitHub Actions entrypoint; only metadata is emitted, never authentication values
const env = process.env
const repository = env.GITHUB_REPOSITORY ?? 'dolimight/wow-companion'
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository')
const api = async route => {
  const response = await fetch(`https://api.github.com/repos/${repository}/${route}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`GitHub release request failed (${response.status})`)
  return response.json()
}
const releases = []
for (let page = 1; ; page++) {
  const batch = await api(`releases?per_page=100&page=${page}`)
  releases.push(...batch)
  if (batch.length < 100) break
}
const tagPush = env.GITHUB_REF?.startsWith('refs/tags/')
const requested = env.RELEASE_CHANNEL || 'nightly'
const channel = tagPush ? releaseChannel(env.GITHUB_REF.slice('refs/tags/'.length)) : requested
if (!CHANNELS.includes(channel) || (tagPush && channel !== 'stable')) throw new Error('Unsupported release channel or tag')
if (!tagPush && env.GITHUB_REF !== 'refs/heads/main') throw new Error('Channel releases must run from main')
const previous = latestRelease(releases, channel)
const now = new Date().toISOString()
let sha = env.GITHUB_SHA, version
let publish = true
if (tagPush) version = stableVersion(env.GITHUB_REF.slice('refs/tags/v'.length))
else if (channel === 'stable') {
  const nightly = latestRelease(releases, 'nightly')
  if (!nightly) throw new Error('Publish and verify a nightly before promoting stable')
  sha = (await api(`commits/${encodeURIComponent(nightly.tag_name)}`)).sha
  version = promotedVersion(nightly.tag_name, env.RELEASE_VERSION?.trim())
} else {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  const stable = latestRelease(releases, 'stable')?.tag_name.slice(1)
  const base = stable && compareVersions(stable, packageJson.version) > 0 ? stable : packageJson.version
  version = nightlyVersion(base, now, env.GITHUB_RUN_NUMBER)
  if (env.GITHUB_EVENT_NAME === 'schedule') {
    const comparison = previous ? (await api(`compare/${encodeURIComponent(previous.tag_name)}...${sha}`)).status : 'ahead'
    publish = nightlyIsDue(previous, comparison, now)
  }
}
if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) throw new Error('Release commit must resolve to an immutable SHA')
// A promoted nightly must belong to main, not an unrelated branch with a similar tag
if (!tagPush) {
  const comparison = await api(`compare/${sha}...main`)
  if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('Release commit is not contained in main')
}
const tag = `v${version}`
const previousStable = latestRelease(releases, 'stable')
if (channel === 'stable' && previousStable && compareVersions(version, previousStable.tag_name.slice(1)) <= 0) throw new Error('A stable release must advance the published stable version')
if (releases.some(r => r.tag_name === tag)) throw new Error(`Release ${tag} already exists`)
const output = { publish, channel, version, tag, sha, previousTag: previous?.tag_name ?? '', name: channel === 'nightly' ? `WOW Companion Nightly ${version}` : `WOW Companion ${version}`, generatedAt: now }
await writeFile('.local-release.json', JSON.stringify(output, null, 2))
if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, Object.entries(output).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
console.log(JSON.stringify(output))
