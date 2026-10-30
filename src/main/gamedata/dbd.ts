/*
 * Parser for WoWDBDefs table definitions (https://github.com/wowdev/WoWDBDefs)
 * Logic follows wow.export's DBDParser (MIT, Kruithne and Marlamin)
 */
export type DbdField = { name: string; type: 'int' | 'float' | 'string' | 'locstring'; signed: boolean; id: boolean; inline: boolean; relation: boolean; arrayLength: number; size: number }
type Entry = { builds: Set<string>; ranges: Array<{ min: string; max: string }>; layouts: Set<string>; fields: DbdField[] }

const COLUMN = /^(int|float|locstring|string)(<[^:]+::[^>]+>)?\s([^\s]+)/
const FIELD = /^(\$([^$]+)\$)?([^<[]+)(<(u|)(\d+)>)?(\[(\d+)\])?$/

const parts = (build: string) => build.split('.').map(Number)
function inRange(build: string, min: string, max: string) {
  const b = parts(build), lo = parts(min), hi = parts(max)
  for (let i = 0; i < 4; i++) {
    if ((b[i] ?? 0) < (lo[i] ?? 0) || (b[i] ?? 0) > (hi[i] ?? 0)) return false
  }
  return true
}

export function parseDbd(text: string) {
  const columns = new Map<string, DbdField['type']>()
  const entries: Entry[] = []
  const chunks = text.split(/\r?\n\s*\r?\n/).map(chunk => chunk.split(/\r?\n/).filter(line => line.trim()))
  for (const chunk of chunks) {
    if (!chunk.length) continue
    if (chunk[0] === 'COLUMNS') {
      for (const line of chunk.slice(1)) {
        const match = line.match(COLUMN)
        if (match) columns.set(match[3]!.replace('?', ''), match[1] as DbdField['type'])
      }
      continue
    }
    const entry: Entry = { builds: new Set(), ranges: [], layouts: new Set(), fields: [] }
    for (const line of chunk) {
      if (line.startsWith('BUILD ')) {
        for (const build of line.slice(6).split(',')) {
          const range = build.trim().match(/([^-]+)-(.*)/)
          if (range) entry.ranges.push({ min: range[1]!.trim(), max: range[2]!.trim() }); else entry.builds.add(build.trim())
        }
        continue
      }
      if (line.startsWith('LAYOUT ')) { for (const hash of line.slice(7).split(',')) entry.layouts.add(hash.trim().toUpperCase()); continue }
      if (line.startsWith('COMMENT ')) continue
      const match = line.match(FIELD)
      if (!match) continue
      const name = match[3]!
      const type = columns.get(name)
      if (!type) throw new Error(`Table definition has no column type for ${name}`)
      const annotations = match[2]?.split(',') ?? []
      entry.fields.push({ name, type, signed: match[5] !== 'u', id: annotations.includes('id'), inline: !annotations.includes('noninline'), relation: annotations.includes('relation'), arrayLength: match[8] ? Number(match[8]) : -1, size: match[6] ? Number(match[6]) : -1 })
    }
    if (entry.fields.length) entries.push(entry)
  }
  return {
    structure(build: string, layoutHash: string): DbdField[] | null {
      const hash = layoutHash.toUpperCase()
      return entries.find(entry => entry.layouts.has(hash))?.fields
        ?? entries.find(entry => entry.builds.has(build) || entry.ranges.some(range => inRange(build, range.min, range.max)))?.fields
        ?? null
    },
  }
}
