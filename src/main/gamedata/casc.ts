/*
 * Read-only reader for a local Retail CASC installation
 * Byte layouts follow wow.export (https://github.com/Kruithne/wow.export, MIT, Kruithne and Marlamin)
 * Files are read on demand and never copied or redistributed
 */
import { open, readdir, readFile, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { Reader } from './binary'
import type { WowInstall } from './install'

const LOCALE_ENUS = 0x2
const CONTENT_LOW_VIOLENCE = 0x80
const CONTENT_NO_NAME_HASH = 0x10000000
const LOCAL_HEADER = 0x1e

type IndexFile = { entries: Buffer; count: number }
type DataLocation = { archive: number; offset: number; size: number }

function parseConfig(text: string) {
  const config: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s][^=]*?)\s*=\s*(.*)$/)
    if (match) config[match[1]!] = match[2]!
  }
  return config
}

/** Decodes a BLTE container; encrypted blocks without a key are zero-filled */
export function decodeBlte(input: Buffer): Buffer {
  const reader = new Reader(input)
  if (reader.u32be() !== 0x424c5445) throw new Error('Game file is not BLTE encoded')
  const headerSize = reader.i32be()
  const blocks: Array<{ compressed: number; decompressed: number }> = []
  if (headerSize > 0) {
    const flags = reader.u8()
    const count = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8()
    if (flags !== 0x0f || count === 0) throw new Error('Unsupported BLTE block table')
    for (let i = 0; i < count; i++) { const compressed = reader.i32be(); const decompressed = reader.i32be(); reader.skip(16); blocks.push({ compressed, decompressed }) }
    reader.seek(headerSize)
  } else blocks.push({ compressed: input.length - 8, decompressed: input.length - 9 })
  const parts: Buffer[] = []
  for (const block of blocks) {
    const data = reader.bytes(block.compressed)
    const mode = data[0]
    const body = data.subarray(1)
    if (mode === 0x4e) parts.push(body)
    else if (mode === 0x5a) parts.push(inflateSync(body))
    else if (mode === 0x45) parts.push(Buffer.alloc(Math.max(0, block.decompressed)))
    else throw new Error(`Unsupported BLTE block mode ${mode}`)
  }
  return parts.length === 1 ? parts[0]! : Buffer.concat(parts)
}

export class LocalCasc {
  private indexes: IndexFile[] = []
  private handles = new Map<number, Promise<FileHandle>>()
  private encoding!: { data: Buffer; pageSize: number; pagesStart: number; pageKeys: Buffer[]; ckeySize: number; ekeySize: number }
  private rootIds!: Int32Array
  private rootKeys!: Int32Array
  private root!: Buffer

  private constructor(readonly install: WowInstall) {}
  get version() { return this.install.build.version }
  get build() { return this.install.build.build }

  static async open(install: WowInstall) {
    const casc = new LocalCasc(install)
    await casc.loadIndexes()
    const config = parseConfig(await readFile(casc.configPath(install.build.buildKey), 'utf8'))
    const encodingKeys = config.encoding?.split(' ') ?? []
    if (encodingKeys.length < 2 || !config.root) throw new Error('This game build is missing its encoding or root configuration')
    casc.loadEncoding(decodeBlte(await casc.readEncoded(encodingKeys[1]!)))
    const rootEncoding = casc.encodingKeyFor(config.root)
    if (!rootEncoding) throw new Error('The game root file could not be located')
    casc.loadRoot(decodeBlte(await casc.readEncoded(rootEncoding)))
    return casc
  }

  private dataDir() { return path.join(this.install.root, 'Data') }
  private configPath(key: string) { return path.join(this.dataDir(), 'config', key.slice(0, 2), key.slice(2, 4), key) }

  /** Only the newest journal version of each of the 16 buckets is current */
  private async loadIndexes() {
    const dir = path.join(this.dataDir(), 'data')
    const latest = new Map<string, string>()
    for (const name of await readdir(dir)) {
      const match = name.match(/^([0-9a-f]{2})([0-9a-f]{8})\.idx$/i)
      if (!match) continue
      const current = latest.get(match[1]!.toLowerCase())
      if (!current || current < name.toLowerCase()) latest.set(match[1]!.toLowerCase(), name.toLowerCase())
    }
    for (const name of latest.values()) {
      const reader = new Reader(await readFile(path.join(dir, name)))
      const headerHashSize = reader.i32()
      reader.seek((8 + headerHashSize + 0x0f) & 0xfffffff0)
      const dataLength = reader.i32()
      reader.skip(4)
      const count = Math.floor(dataLength / 18)
      const entries = Buffer.from(reader.bytes(count * 18))
      let sorted = true
      for (let i = 1; i < count && sorted; i++) if (Buffer.compare(entries.subarray((i - 1) * 18, (i - 1) * 18 + 9), entries.subarray(i * 18, i * 18 + 9)) > 0) sorted = false
      if (!sorted) {
        const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => Buffer.compare(entries.subarray(a * 18, a * 18 + 9), entries.subarray(b * 18, b * 18 + 9)))
        this.indexes.push({ entries: Buffer.concat(order.map(i => entries.subarray(i * 18, i * 18 + 18))), count })
      } else this.indexes.push({ entries, count })
    }
    if (!this.indexes.length) throw new Error('No local game data indexes were found')
  }

  private locate(encodingKey: string): DataLocation | null {
    const key = Buffer.from(encodingKey.slice(0, 18), 'hex')
    for (const index of this.indexes) {
      let low = 0, high = index.count - 1
      while (low <= high) {
        const mid = (low + high) >> 1
        const at = mid * 18
        const compare = Buffer.compare(index.entries.subarray(at, at + 9), key)
        if (compare === 0) {
          const high8 = index.entries.readUInt8(at + 9)
          const low32 = index.entries.readUInt32BE(at + 10)
          return { archive: (high8 << 2) | (low32 >>> 30), offset: low32 & 0x3fffffff, size: index.entries.readUInt32LE(at + 14) }
        }
        if (compare < 0) low = mid + 1; else high = mid - 1
      }
    }
    return null
  }

  private handle(archive: number) {
    let handle = this.handles.get(archive)
    if (!handle) { handle = open(path.join(this.dataDir(), 'data', `data.${String(archive).padStart(3, '0')}`), 'r'); this.handles.set(archive, handle) }
    return handle
  }

  private async readEncoded(encodingKey: string) {
    const location = this.locate(encodingKey)
    if (!location) throw new Error('This file is not stored in the local game data')
    const handle = await this.handle(location.archive)
    const buffer = Buffer.alloc(location.size - LOCAL_HEADER)
    await handle.read(buffer, 0, buffer.length, location.offset + LOCAL_HEADER)
    return buffer
  }

  /** Keeps encoding pages in memory and binary-searches them instead of expanding millions of keys */
  private loadEncoding(data: Buffer) {
    const reader = new Reader(data)
    if (reader.u16be() !== 0x454e) throw new Error('Invalid encoding table')
    reader.skip(1)
    const ckeySize = reader.u8(), ekeySize = reader.u8()
    const pageSize = reader.u16be() * 1024
    reader.skip(2)
    const pageCount = reader.u32be()
    reader.skip(5)
    const specSize = reader.u32be()
    reader.skip(specSize)
    const pageKeys: Buffer[] = []
    for (let i = 0; i < pageCount; i++) { pageKeys.push(reader.bytes(ckeySize)); reader.skip(16) }
    this.encoding = { data, pageSize, pagesStart: reader.offset, pageKeys, ckeySize, ekeySize }
  }

  encodingKeyFor(contentKey: string): string | null {
    const { data, pageSize, pagesStart, pageKeys, ckeySize, ekeySize } = this.encoding
    const key = Buffer.from(contentKey, 'hex')
    let low = 0, high = pageKeys.length - 1, page = -1
    while (low <= high) { const mid = (low + high) >> 1; if (Buffer.compare(pageKeys[mid]!, key) <= 0) { page = mid; low = mid + 1 } else high = mid - 1 }
    if (page < 0) return null
    const reader = new Reader(data).seek(pagesStart + page * pageSize)
    const end = reader.offset + pageSize
    while (reader.offset < end) {
      const count = reader.u8()
      if (count === 0) break
      reader.skip(5)
      const ckey = reader.bytes(ckeySize)
      const ekey = reader.hex(ekeySize)
      reader.skip(ekeySize * (count - 1))
      if (ckey.equals(key)) return ekey
    }
    return null
  }

  /** Builds a sorted FileDataID table for enUS, non-low-violence entries pointing into the root buffer */
  private loadRoot(data: Buffer) {
    const reader = new Reader(data)
    if (reader.u32() !== 0x4d465354) throw new Error('Unsupported root format')
    let headerSize = reader.u32()
    let version = reader.u32()
    let total: number, named: number
    if (headerSize !== 0x18) { total = headerSize; named = version; version = 0; headerSize = 12 } else { total = reader.u32(); named = reader.u32() }
    reader.seek(headerSize)
    const allowNameless = total !== named
    const ids: number[] = []
    const keys: number[] = []
    while (reader.remaining > 0) {
      const count = reader.u32()
      let locale: number, content: number
      if (version === 2) { locale = reader.u32(); const a = reader.u32(), b = reader.u32(), c = reader.u8(); content = a | b | (c << 17) } else { content = reader.u32(); locale = reader.u32() }
      const include = (locale & LOCALE_ENUS) !== 0 && (content & CONTENT_LOW_VIOLENCE) === 0
      const blockIds = new Int32Array(count)
      let id = 0
      for (let i = 0; i < count; i++) { const next = id + reader.i32(); blockIds[i] = next; id = next + 1 }
      const keyStart = reader.offset
      reader.skip(16 * count)
      if (!(allowNameless && (content & CONTENT_NO_NAME_HASH))) reader.skip(8 * count)
      if (include) for (let i = 0; i < count; i++) { ids.push(blockIds[i]!); keys.push(keyStart + i * 16) }
    }
    const order = Array.from({ length: ids.length }, (_, i) => i).sort((a, b) => ids[a]! - ids[b]! || a - b)
    const sortedIds: number[] = [], sortedKeys: number[] = []
    for (const i of order) if (sortedIds.at(-1) !== ids[i]) { sortedIds.push(ids[i]!); sortedKeys.push(keys[i]!) }
    this.rootIds = Int32Array.from(sortedIds)
    this.rootKeys = Int32Array.from(sortedKeys)
    this.root = data
  }

  private contentKeyFor(fileDataId: number) {
    let low = 0, high = this.rootIds.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const value = this.rootIds[mid]!
      if (value === fileDataId) return this.root.toString('hex', this.rootKeys[mid]!, this.rootKeys[mid]! + 16)
      if (value < fileDataId) low = mid + 1; else high = mid - 1
    }
    return null
  }

  has(fileDataId: number) { const ckey = this.contentKeyFor(fileDataId); return !!ckey && !!this.encodingKeyFor(ckey) }

  async file(fileDataId: number): Promise<Buffer> {
    const ckey = this.contentKeyFor(fileDataId)
    if (!ckey) throw new Error(`Game file ${fileDataId} is not part of this build`)
    const ekey = this.encodingKeyFor(ckey)
    if (!ekey) throw new Error(`Game file ${fileDataId} has no encoding entry`)
    return decodeBlte(await this.readEncoded(ekey))
  }

  async close() {
    const handles = [...this.handles.values()]
    this.handles.clear()
    await Promise.all(handles.map(async handle => (await handle).close().catch(() => {})))
  }
}
