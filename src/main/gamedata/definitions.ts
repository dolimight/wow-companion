import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseDbd, type DbdField } from './dbd'

const ORIGIN = 'https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/'
const MAX_BYTES = 8 * 1024 * 1024

async function download(file: string) {
  const response = await fetch(ORIGIN + file, { signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Table definitions could not be downloaded (${response.status})`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new Error('Table definition download is too large')
  const text = await response.text()
  if (text.length > MAX_BYTES) throw new Error('Table definition download is too large')
  return text
}

/** WoWDBDefs files are cached so item data keeps working offline after the first download */
export class Definitions {
  private manifest: Map<string, number> | null = null
  constructor(private readonly directory: string) {}

  private async cached(file: string, refresh: boolean) {
    const target = path.join(this.directory, file.replace(/\//g, '_'))
    if (!refresh) { try { return await readFile(target, 'utf8') } catch { /* download below */ } }
    try {
      const text = await download(file)
      await mkdir(this.directory, { recursive: true })
      await writeFile(target, text, 'utf8')
      return text
    } catch (error) {
      try { return await readFile(target, 'utf8') } catch { throw error }
    }
  }

  async fileDataId(table: string): Promise<number> {
    if (!this.manifest) {
      const load = async (refresh: boolean) => new Map((JSON.parse(await this.cached('manifest.json', refresh)) as Array<{ tableName: string; db2FileDataID?: number }>).flatMap(entry => entry.db2FileDataID ? [[entry.tableName, entry.db2FileDataID] as const] : []))
      this.manifest = await load(false)
      if (!this.manifest.has(table)) this.manifest = await load(true)
    }
    const id = this.manifest.get(table)
    if (!id) throw new Error(`No game file is known for the ${table} table`)
    return id
  }

  /** A cached definition that predates this build or layout is refreshed once */
  async fields(table: string, build: string, layoutHash: string): Promise<DbdField[]> {
    const file = `definitions/${table}.dbd`
    let fields = parseDbd(await this.cached(file, false)).structure(build, layoutHash)
    if (!fields) fields = parseDbd(await this.cached(file, true)).structure(build, layoutHash)
    if (!fields) throw new Error(`The ${table} table layout for ${build} is not described yet`)
    return fields
  }
}
