import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const commit = 'a'.repeat(40), head = 'b'.repeat(40)
async function prepare(overrides, responses) {
  const folder = await mkdtemp(join(tmpdir(), 'wow-release-'))
  try {
    await writeFile(join(folder, 'package.json'), JSON.stringify({ version: '0.1.0' }))
    const mock = join(folder, 'mock-api.mjs')
    await writeFile(mock, `const responses=JSON.parse(process.env.TEST_RELEASE_RESPONSES);globalThis.fetch=async url=>{const route=new URL(url).pathname.replace('/repos/dolimight/wow-companion/','');if(!(route in responses))throw Error('Unexpected API route '+route);return {ok:true,status:200,json:async()=>responses[route]}}`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, fileURLToPath(new URL('./prepare.mjs', import.meta.url))], {
      cwd: folder, encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'test-only-authentication', GITHUB_REPOSITORY: 'dolimight/wow-companion', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: head, GITHUB_RUN_NUMBER: '42', RELEASE_CHANNEL: 'nightly', RELEASE_VERSION: '', GITHUB_OUTPUT: join(folder, 'outputs'), ...overrides, TEST_RELEASE_RESPONSES: JSON.stringify(responses) },
    })
    let metadata
    try { metadata = JSON.parse(await readFile(join(folder, '.local-release.json'), 'utf8')) } catch {}
    assert.doesNotMatch(result.stdout + result.stderr, /test-only-authentication/)
    return { ...result, metadata }
  } finally { await rm(folder, { recursive: true, force: true }) }
}

test('stable dispatch promotes the published nightly SHA instead of current main HEAD', async () => {
  const nightly = 'v0.1.1-nightly.20261030.1'
  const result = await prepare({ RELEASE_CHANNEL: 'stable' }, {
    releases: [{ tag_name: nightly, published_at: '2026-10-30T00:00:00Z' }, { tag_name: 'v0.1.0', published_at: '2026-10-29T00:00:00Z' }],
    [`commits/${nightly}`]: { sha: commit }, [`compare/${commit}...main`]: { status: 'ahead' },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.metadata.sha, commit)
  assert.equal(result.metadata.version, '0.1.1')
  assert.equal(result.metadata.previousTag, 'v0.1.0')
})

test('nightlies advance beyond the latest stable even when source package metadata is older', async () => {
  const result = await prepare({}, { releases: [{ tag_name: 'v0.1.5', published_at: '2026-10-29T00:00:00Z' }], [`compare/${head}...main`]: { status: 'identical' } })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.metadata.version, /^0\.1\.6-nightly\.\d{8}\.42$/)
  assert.equal(result.metadata.sha, head)
})

test('stable promotion fails closed without a published nightly or from an untrusted branch', async () => {
  const missing = await prepare({ RELEASE_CHANNEL: 'stable' }, { releases: [] })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Publish and verify a nightly/)
  const branch = await prepare({ GITHUB_REF: 'refs/heads/feature' }, { releases: [] })
  assert.notEqual(branch.status, 0)
  assert.match(branch.stderr, /must run from main/)
})

test('scheduled unchanged nightlies skip publication while manual dispatch remains available', async () => {
  const nightly = 'v0.1.1-nightly.20261029.1'
  const responses = { releases: [{ tag_name: nightly, published_at: '2020-01-01T00:00:00Z' }], [`compare/${nightly}...${head}`]: { status: 'identical' }, [`compare/${head}...main`]: { status: 'identical' } }
  const scheduled = await prepare({ GITHUB_EVENT_NAME: 'schedule' }, responses)
  assert.equal(scheduled.status, 0, scheduled.stderr)
  assert.equal(scheduled.metadata.publish, false)
  const manual = await prepare({}, responses)
  assert.equal(manual.status, 0, manual.stderr)
  assert.equal(manual.metadata.publish, true)
})

test('explicit stable tags target their exact commit without requiring a nightly', async () => {
  const result = await prepare({ GITHUB_REF: 'refs/tags/v0.2.0', GITHUB_EVENT_NAME: 'push' }, { releases: [] })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.metadata.version, '0.2.0')
  assert.equal(result.metadata.sha, head)
})
