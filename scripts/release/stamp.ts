import { readFile, writeFile } from 'node:fs/promises'
import { releaseChannel } from './metadata.ts'
const version = process.argv[2]
if (!version || !releaseChannel(`v${version}`)) throw new Error('Unsupported release version')
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(await readFile(file, 'utf8')) as { version?: string; packages?: Record<string, { version?: string }> }
  data.version = version
  if (data.packages?.['']) data.packages[''].version = version
  await writeFile(file, JSON.stringify(data, null, 2) + '\n')
}
