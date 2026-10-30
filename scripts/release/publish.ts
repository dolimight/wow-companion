import { execFileSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { releaseChannel } from './metadata.ts'

const { RELEASE_TAG: tag, RELEASE_SHA: sha, RELEASE_CHANNEL: channel, RELEASE_VERSION: version } = process.env
if (!tag || !sha || !version || !/^[a-f0-9]{40}$/i.test(sha) || tag !== `v${version}` || releaseChannel(tag) !== channel) throw new Error('Invalid release metadata')
const files = (await readdir('release-publish')).sort().map(file => join('release-publish', file))
if (!files.length) throw new Error('No validated release assets')
const title = `WOW Companion ${channel === 'nightly' ? 'Nightly ' : ''}${version}`
const gh = (args: string[]) => execFileSync('gh', args, { stdio: 'inherit', windowsHide: true })
gh(['release', 'create', tag, ...files, '--draft', '--target', sha, '--title', title, '--notes-file', 'release-notes.md'])
gh(['release', 'edit', tag, '--draft=false', `--prerelease=${channel === 'nightly'}`, `--latest=${channel === 'stable'}`])
