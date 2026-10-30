import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mergeManifests, validateManifest } from './artifacts.ts'
import type { UpdateFile, UpdateManifest } from './types.ts'
const entry = (name: string, bytes: Buffer): UpdateFile => ({ url: name, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') })
const manifest = (file: UpdateFile): UpdateManifest => ({ version: '0.1.0', files: [file], path: file.url, sha512: file.sha512, releaseDate: '2026-10-30T00:00:00Z' })
test('macOS manifest merges preserve both architecture-specific ZIP downloads', () => {
  const x64 = Buffer.from('intel'), arm64 = Buffer.from('arm')
  const files = [entry('WOW-Companion-0.1.0-mac-x64.zip', x64), entry('WOW-Companion-0.1.0-mac-arm64.zip', arm64)]
  const assets = new Map([[files[0].url, x64], [files[1].url, arm64]])
  const result = mergeManifests(files.map(manifest).reverse(), assets, '0.1.0')
  assert.equal(result.files.length, 2)
  assert.equal(result.path, files[0].url)
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
