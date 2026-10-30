import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectArtifacts, mergeManifests, validateManifest } from './artifacts.ts'
import type { UpdateFile, UpdateManifest } from './types.ts'
const entry = (name: string, bytes: Buffer): UpdateFile => ({ url: name, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') })
const manifest = (file: UpdateFile): UpdateManifest => ({ version: '0.1.0', files: [file], path: file.url, sha512: file.sha512, releaseDate: '2026-10-30T00:00:00Z' })
test('manifest merges keep every verified download', () => {
  const full = Buffer.from('full installer'), other = Buffer.from('other installer')
  const files = [entry('a.exe', full), entry('b.exe', other)]
  const assets = new Map([[files[0].url, full], [files[1].url, other]])
  const result = mergeManifests(files.map(manifest), assets, '0.1.0')
  assert.equal(result.files.length, 2)
  assert.equal(result.path, files[0].url)
})
test('a Windows-only release collects its installer, blockmap, manifest, and checksums', async () => {
  const input = await mkdtemp(join(tmpdir(), 'wow-release-in-')), output = await mkdtemp(join(tmpdir(), 'wow-release-out-'))
  const installer = Buffer.from('installer'), blockmap = Buffer.from('blockmap')
  const file = entry('WOW-Companion-0.1.0-win-x64.exe', installer)
  await mkdir(join(input, 'desktop-win-x64'))
  await writeFile(join(input, 'desktop-win-x64', file.url), installer)
  await writeFile(join(input, 'desktop-win-x64', file.url + '.blockmap'), blockmap)
  await writeFile(join(input, 'desktop-win-x64', 'latest.yml'), `version: 0.1.0
files:
  - url: ${file.url}
    sha512: ${file.sha512}
    size: ${file.size}
path: ${file.url}
sha512: ${file.sha512}
releaseDate: '2026-10-30T00:00:00Z'
`)
  await collectArtifacts(input, output, '0.1.0')
  assert.match(await readFile(join(output, 'latest.yml'), 'utf8'), /WOW-Companion-0.1.0-win-x64.exe/)
  assert.match(await readFile(join(output, 'SHA256SUMS'), 'utf8'), /win-x64.exe.blockmap/)
})
test('a macOS manifest is no longer an accepted release asset', async () => {
  const input = await mkdtemp(join(tmpdir(), 'wow-release-mac-'))
  await writeFile(join(input, 'latest-mac.yml'), 'version: 0.1.0\nfiles: []\n')
  await assert.rejects(collectArtifacts(input, join(input, 'out'), '0.1.0'), /Unexpected channel manifest/)
})
test('manifests reject incomplete, tampered, wrong-version, and external downloads', () => {
  const bytes = Buffer.from('installer'), file = entry('app.exe', bytes), assets = new Map([['app.exe', bytes]])
  validateManifest(manifest(file), assets, '0.1.0')
  assert.throws(() => validateManifest(manifest(file), new Map(), '0.1.0'))
  assert.throws(() => validateManifest(manifest(file), assets, '0.2.0'))
  assert.throws(() => validateManifest(manifest(file), new Map([['app.exe', Buffer.from('tampered')]]), '0.1.0'))
  assert.throws(() => validateManifest(manifest({ ...file, url: '../app.exe' }), assets, '0.1.0'))
  assert.throws(() => validateManifest(manifest({ ...file, url: 'https://other/app.exe' }), assets, '0.1.0'))
})
