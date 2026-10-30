import { readFile, writeFile } from 'node:fs/promises'
import { releaseChannel } from './metadata.mjs'
const version = process.argv[2]
if (!releaseChannel(`v${version}`)) throw new Error('Unsupported release version')
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(await readFile(file, 'utf8'))
  data.version = version
  if (data.packages?.['']) data.packages[''].version = version
  await writeFile(file, JSON.stringify(data, null, 2) + '\n')
}
