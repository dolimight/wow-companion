import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

export type BuildInfo = { branch: string; buildKey: string; cdnKey: string; version: string; product: string; build: number }
export type WowInstall = { root: string; retail: string; build: BuildInfo }

/** Parses the pipe-separated `.build.info` table written by the Battle.net launcher */
export function parseBuildInfo(text: string): BuildInfo[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines.shift()?.split('|').map(column => column.split('!')[0]!) ?? []
  return lines.map(line => {
    const values = line.split('|')
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? '']))
    const version = row.Version ?? ''
    return { branch: row.Branch ?? '', buildKey: row['Build Key'] ?? '', cdnKey: row['CDN Key'] ?? '', version, product: row.Product ?? '', build: Number(version.split('.').at(-1)) || 0, active: row.Active === '1' }
  }).filter(row => row.active && row.buildKey).map(({ active: _active, ...row }) => row)
}

const exists = (file: string) => access(file).then(() => true, () => false)

/** Accepts the World of Warcraft folder, its `_retail_` folder, or anything inside them */
export async function readInstall(candidate: string): Promise<WowInstall | null> {
  let dir = path.resolve(candidate)
  for (let depth = 0; depth < 4; depth++) {
    const info = path.join(dir, '.build.info')
    if (await exists(info) && await exists(path.join(dir, 'Data', 'data'))) {
      const retail = parseBuildInfo(await readFile(info, 'utf8')).find(row => row.product === 'wow')
      if (!retail) return null
      return { root: dir, retail: path.join(dir, '_retail_'), build: retail }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function registryValue(key: string, value: string): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  return new Promise(resolve => execFile('reg', ['query', key, '/v', value], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
    if (error) return resolve(null)
    const match = stdout.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`))
    resolve(match?.[1]?.trim() ?? null)
  }))
}

/** Battle.net's product database is protobuf; install paths appear as plain strings inside it */
async function productDbPaths(): Promise<string[]> {
  const file = process.platform === 'win32' ? 'C:\\ProgramData\\Battle.net\\Agent\\product.db' : '/Users/Shared/Battle.net/Agent/product.db'
  try {
    const text = (await readFile(file)).toString('latin1')
    return [...text.matchAll(/(?:[A-Za-z]:[\\/]|\/)[^\x00-\x1f"]{3,200}?World of Warcraft/g)].map(match => match[0])
  } catch { return [] }
}

export async function detectInstall(): Promise<WowInstall | null> {
  const candidates = [
    await registryValue('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\World of Warcraft', 'InstallLocation'),
    await registryValue('HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment\\World of Warcraft', 'InstallPath'),
    ...await productDbPaths(),
    'C:\\Program Files (x86)\\World of Warcraft',
    'C:\\Program Files\\World of Warcraft',
    'D:\\World of Warcraft',
    '/Applications/World of Warcraft',
  ].filter((value): value is string => !!value)
  for (const candidate of [...new Set(candidates)]) {
    const install = await readInstall(candidate)
    if (install) return install
  }
  return null
}
