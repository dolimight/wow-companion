import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { noteSummary } from './metadata.mjs'
const metadata = JSON.parse(await readFile(process.argv[2] ?? '.local-release.json', 'utf8'))
const previous = metadata.previousTag
const range = previous ? `${previous}..${metadata.sha}` : metadata.sha
const subjects = execFileSync('git', ['log', '--reverse', '--format=%s', range], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const repository = process.env.GITHUB_REPOSITORY ?? 'dolimight/wow-companion'
const response = await fetch(`https://api.github.com/repos/${repository}/releases/generate-notes`, {
  method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: metadata.tag, target_commitish: metadata.sha, ...(previous ? { previous_tag_name: previous } : {}) }), signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`Release-note generation failed (${response.status})`)
const full = (await response.json()).body
await writeFile('release-notes.md', `**${metadata.version}** · ${subjects.length} changes\n\n${noteSummary(subjects)}\n\n<details>\n<summary>Full changelog</summary>\n\n${full}\n\n</details>\n`)
