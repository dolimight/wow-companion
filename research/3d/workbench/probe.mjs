// Read-only provenance probe, does not execute or bundle upstream code or game files
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const checkout = path.resolve(process.argv[2] || 'research/3d/vendor/wow.export')
const game = path.resolve(process.argv[3] || 'C:/Program Files (x86)/World of Warcraft')
const sources = ['src/js/modules/tab_characters.js', 'src/js/3D/renderers/M2RendererGL.js', 'src/js/3D/renderers/CharMaterialRenderer.js', 'src/js/casc/casc-source-local.js', 'src/js/ui/character-appearance.js', 'src/js/db/caches/DBCharacterCustomization.js', 'build.json', 'package.json', 'LICENSE']
const records = []
for (const source of sources) {
  const content = await readFile(path.join(checkout, source), 'utf8')
  records.push({ path: source, sha256: createHash('sha256').update(content).digest('hex'), lines: content.split('\n').length, localImports: [...content.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].map((match) => match[1]) })
}
const info = (await readFile(path.join(game, '.build.info'), 'utf8')).trim().split(/\r?\n/)
const columns = info[0].split('|').map((column) => column.split('!')[0])
const builds = info.slice(1).map((line) => Object.fromEntries(line.split('|').map((value, index) => [columns[index], value]))).map(({ Product, Version, Active }) => ({ product: Product, version: Version, active: Active }))
const dataPresent = await stat(path.join(game, 'Data/data')).then((entry) => entry.isDirectory(), () => false)
const result = { inspectedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), builds, localDataDirectoryPresent: dataPresent, sources: records, dynamicSwapExecuted: false, runtimeBenchmarkExecuted: false }
await writeFile('research/3d/source-probe.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ sourceCommit: result.sourceCommit, builds, dataPresent, inspectedSources: records.length, dynamicSwapExecuted: false }, null, 2))
