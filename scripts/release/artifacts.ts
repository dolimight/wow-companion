import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { releaseChannel } from './metadata.ts'
import type { UpdateFile, UpdateManifest } from './types.ts'
// Use electron-builder's YAML parser, resolving relative to its dependency tree
const requireBuilder = createRequire(import.meta.resolve('app-builder-lib'))
const yaml = requireBuilder('js-yaml') as { load(text: string): unknown; dump(value: unknown): string }

export function validateManifest(info: UpdateManifest, assets: Map<string, Buffer>, version: string) {
  if (info.version !== version || !Array.isArray(info.files) || !info.files.length) throw new Error('Invalid update manifest version or file list')
  for (const file of info.files) {
    if (typeof file.url !== 'string' || basename(file.url) !== file.url || !/\.exe$/.test(file.url)) throw new Error('Update manifest contains an unsafe asset URL')
    const bytes = assets.get(file.url)
    if (!bytes) throw new Error(`Missing update asset ${file.url}`)
    if (createHash('sha512').update(bytes).digest('base64') !== file.sha512 || bytes.length !== file.size) throw new Error(`Update asset integrity mismatch: ${file.url}`)
  }
  if (!info.files.some(file => file.url === info.path && file.sha512 === info.sha512)) throw new Error('Manifest fallback path does not match a verified file')
}

export function mergeManifests(manifests: UpdateManifest[], assets: Map<string, Buffer>, version: string): UpdateManifest {
  if (!manifests.length) throw new Error('No update manifests to merge')
  for (const manifest of manifests) validateManifest(manifest, assets, version)
  const files = new Map<string, UpdateFile>()
  for (const manifest of manifests) for (const file of manifest.files) {
    const prior = files.get(file.url)
    if (prior && prior.sha512 !== file.sha512) throw new Error('Conflicting update assets')
    files.set(file.url, file)
  }
  return { ...manifests[0], files: [...files.values()] }
}

export async function collectArtifacts(input: string, output: string, version: string) {
  const channel = releaseChannel(`v${version}`)
  if (!channel) throw new Error('Invalid release version')
  const prefix = channel === 'stable' ? 'latest' : 'nightly'
  const manifestName = `${prefix}.yml`
  const assets = new Map<string, Buffer>(), manifests = new Map<string, UpdateManifest[]>()
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) { await visit(file); continue }
      if (!entry.isFile()) throw new Error('Release artifacts must be regular files')
      if (entry.name.endsWith('.yml')) {
        if (entry.name !== manifestName) throw new Error(`Unexpected channel manifest ${entry.name}`)
        const info = yaml.load(await readFile(file, 'utf8')) as UpdateManifest
        manifests.set(entry.name, [...(manifests.get(entry.name) ?? []), info])
      } else if (/\.(exe|blockmap)$/.test(entry.name)) {
        const bytes = await readFile(file)
        const previous = assets.get(entry.name)
        if (previous && !previous.equals(bytes)) throw new Error(`Conflicting artifact ${entry.name}`)
        assets.set(entry.name, bytes)
      } else throw new Error(`Unexpected release asset ${entry.name}`)
    }
  }
  await visit(input)
  if (!manifests.has(manifestName)) throw new Error(`Missing platform update manifest ${manifestName}`)
  if (![...assets.keys()].some(name => name.endsWith('.exe.blockmap'))) throw new Error('Missing Windows differential blockmap')
  await mkdir(output, { recursive: true })
  for (const [name, bytes] of assets) await writeFile(join(output, name), bytes)
  for (const [name, entries] of manifests) await writeFile(join(output, name), yaml.dump(mergeManifests(entries, assets, version)))
  const checksums = [...assets].map(([name, bytes]) => `${createHash('sha256').update(bytes).digest('hex')}  ${name}`).sort().join('\n') + '\n'
  await writeFile(join(output, 'SHA256SUMS'), checksums)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const version = process.argv[4]
  if (!version) throw new Error('Pass the expected release version')
  await collectArtifacts(process.argv[2] ?? 'release-artifacts', process.argv[3] ?? 'release-publish', version)
}
