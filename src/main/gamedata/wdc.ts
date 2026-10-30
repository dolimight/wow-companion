/*
 * WDC3, WDC4, and WDC5 client database reader
 * Field decoding follows wow.export's WDCReader (MIT, Kruithne and Marlamin)
 * Section data is located through each section header's file offset, so optional WDC4+ blocks never shift reads
 */
import { Reader } from './binary'
import type { DbdField } from './dbd'

export type Row = Record<string, number | string | number[] | string[]>

const enum Compression { None = 0, Bitpacked = 1, CommonData = 2, Indexed = 3, IndexedArray = 4, Signed = 5 }
const FORMATS: Record<number, number> = { 0x33434457: 3, 0x34434457: 4, 0x35434457: 5 }

type FieldInfo = { offsetBits: number; sizeBits: number; additional: number; compression: number; packing: [number, number, number] }
type Section = { tactKeyHash: bigint; fileOffset: number; recordCount: number; stringTableSize: number; offsetRecordsEnd: number; idListSize: number; relationshipSize: number; offsetMapCount: number; copyCount: number }

export type Db2Header = { version: number; layoutHash: string; recordCount: number }

export function readHeader(buffer: Buffer): Db2Header {
  const reader = new Reader(buffer)
  const version = FORMATS[reader.u32()]
  if (!version) throw new Error('Unsupported client database format')
  if (version === 5) reader.skip(4 + 128)
  const recordCount = reader.u32()
  reader.skip(16)
  const layoutHash = reader.u32().toString(16).padStart(8, '0').toUpperCase()
  return { version, layoutHash, recordCount }
}

const view = new DataView(new ArrayBuffer(8))
/** Pallet and common values are stored as raw 32-bit patterns and must be reinterpreted for the field type */
function cast(raw: number | bigint, field: DbdField): number {
  const bits = BigInt.asUintN(64, BigInt(raw))
  view.setBigUint64(0, bits, true)
  if (field.type === 'float') return view.getFloat32(0, true)
  const size = field.size > 0 ? field.size : 32
  if (size === 64) return Number(field.signed ? view.getBigInt64(0, true) : view.getBigUint64(0, true))
  const value = Number(BigInt.asUintN(size, bits))
  return field.signed && value >= 2 ** (size - 1) ? value - 2 ** size : value
}

function readPlain(reader: Reader, field: DbdField): number {
  if (field.type === 'float') return reader.f32()
  const size = field.size > 0 ? field.size : 32
  switch (size) {
    case 8: return field.signed ? reader.i8() : reader.u8()
    case 16: return field.signed ? reader.i16() : reader.u16()
    case 32: return field.signed ? reader.i32() : reader.u32()
    default: return Number(field.signed ? reader.i64() : reader.u64())
  }
}

/** Reads every unencrypted row; `pick` limits which fields are materialized */
export function readTable(buffer: Buffer, fields: DbdField[], pick?: Set<string>): Map<number, Row> {
  const reader = new Reader(buffer)
  const version = FORMATS[reader.u32()]
  if (!version) throw new Error('Unsupported client database format')
  if (version === 5) reader.skip(4 + 128)
  const totalRecords = reader.u32()
  reader.skip(4)
  const recordSize = reader.u32()
  reader.skip(4 + 4 + 4)
  reader.skip(4 + 4 + 4) // min ID, max ID, locale
  const flags = reader.u16()
  const idIndex = reader.u16()
  const totalFieldCount = reader.u32()
  reader.skip(4 + 4)
  const fieldInfoSize = reader.u32()
  reader.skip(4 + 4) // common and pallet sizes; blocks are read by field below
  const sectionCount = reader.u32()
  const sections: Section[] = []
  for (let i = 0; i < sectionCount; i++) sections.push({ tactKeyHash: reader.u64(), fileOffset: reader.u32(), recordCount: reader.u32(), stringTableSize: reader.u32(), offsetRecordsEnd: reader.u32(), idListSize: reader.u32(), relationshipSize: reader.u32(), offsetMapCount: reader.u32(), copyCount: reader.u32() })
  reader.skip(totalFieldCount * 4)
  const info: FieldInfo[] = []
  for (let i = 0; i < fieldInfoSize / 24; i++) info.push({ offsetBits: reader.u16(), sizeBits: reader.u16(), additional: reader.u32(), compression: reader.u32(), packing: [reader.u32(), reader.u32(), reader.u32()] })
  const pallet: number[][] = info.map(field => {
    if (field.compression !== Compression.Indexed && field.compression !== Compression.IndexedArray) return []
    const values: number[] = []
    for (let i = 0; i < field.additional / 4; i++) values.push(reader.u32())
    return values
  })
  const common: Map<number, number>[] = info.map(field => {
    const map = new Map<number, number>()
    if (field.compression === Compression.CommonData) for (let i = 0; i < field.additional / 8; i++) map.set(reader.u32(), reader.u32())
    return map
  })

  const sparse = (flags & 1) !== 0
  const rows = new Map<number, Row>()
  const copies: Array<[number, number]> = []
  let outsideData = 0
  let stringBase = 0
  const stringTables: Array<{ start: number; base: number; size: number }> = []
  const prepared = sections.map(section => {
    const recordDataSize = sparse ? section.offsetRecordsEnd - section.fileOffset : recordSize * section.recordCount
    const stringStart = section.fileOffset + recordDataSize
    stringTables.push({ start: stringStart, base: stringBase, size: section.stringTableSize })
    stringBase += section.stringTableSize
    const tail = new Reader(buffer).seek(stringStart + section.stringTableSize)
    const idList: number[] = []
    for (let i = 0; i < section.idListSize / 4; i++) idList.push(tail.u32())
    for (let i = 0; i < section.copyCount; i++) { const destination = tail.i32(), source = tail.i32(); if (destination !== source) copies.push([destination, source]) }
    const offsetMap: Array<{ offset: number; size: number }> = []
    for (let i = 0; i < section.offsetMapCount; i++) offsetMap.push({ offset: tail.u32(), size: tail.u16() })
    const relationships = new Map<number, number>()
    if (section.relationshipSize > 0) {
      const start = tail.offset
      const count = tail.u32()
      tail.skip(8)
      for (let i = 0; i < count; i++) { const foreign = tail.u32(); relationships.set(tail.u32(), foreign) }
      tail.seek(start + section.relationshipSize)
    }
    const offsetIds: number[] = []
    for (let i = 0; i < section.offsetMapCount; i++) offsetIds.push(tail.u32())
    const ids = idList.length ? idList : offsetIds
    let encrypted = false
    if (section.tactKeyHash !== 0n) {
      encrypted = true
      for (let i = section.fileOffset; i < section.fileOffset + recordDataSize; i++) if (buffer[i] !== 0) { encrypted = false; break }
    }
    const result = { section, recordDataSize, ids, offsetMap, relationships, encrypted, outsideData }
    outsideData += recordDataSize
    return result
  })

  const readString = (index: number) => {
    const table = stringTables.find(entry => index >= entry.base && index < entry.base + entry.size)
    return table ? reader.cstringAt(table.start + index - table.base) : ''
  }
  const cursor = new Reader(buffer)
  const padded = Buffer.alloc(8)

  for (const part of prepared) {
    if (part.encrypted) continue
    const { section, ids, offsetMap, relationships } = part
    for (let index = 0; index < section.recordCount; index++) {
      let id: number | undefined = ids.length ? ids[index] : undefined
      const recordStart = sparse ? offsetMap[index]!.offset : section.fileOffset + index * recordSize
      if (sparse && offsetMap[index]!.size === 0) continue
      const absolute = (sparse ? recordStart : index * recordSize) - totalRecords * recordSize
      cursor.seek(recordStart)
      const row: Row = {}
      let fieldIndex = 0
      for (const field of fields) {
        if (field.relation && !field.inline) { if (!pick || pick.has(field.name)) row[field.name] = relationships.get(index) ?? 0; continue }
        if (field.id && !field.inline) { if (id !== undefined) row[field.name] = id; continue }
        const fieldInfo = info[fieldIndex]!
        const count = field.arrayLength > 0 ? field.arrayLength : 0
        let value: Row[string]
        if (fieldInfo.compression === Compression.None) {
          if (!sparse) cursor.seek(recordStart + (fieldInfo.offsetBits >> 3))
          if (field.type === 'string' || field.type === 'locstring') {
            const readOne = (position: number) => {
              if (sparse) return cursor.cstring()
              const offset = cursor.u32()
              return offset === 0 ? '' : readString(part.outsideData + absolute + position + offset)
            }
            if (count) { const values: string[] = []; for (let i = 0; i < count; i++) values.push(readOne((fieldInfo.offsetBits >> 3) + i * 4)); value = values }
            else value = readOne(fieldInfo.offsetBits >> 3)
          } else if (count) { const values: number[] = []; for (let i = 0; i < count; i++) values.push(readPlain(cursor, field)); value = values }
          else value = readPlain(cursor, field)
        } else if (fieldInfo.compression === Compression.CommonData) {
          value = cast(common[fieldIndex]!.get(id ?? -1) ?? fieldInfo.packing[0], field)
        } else {
          const at = recordStart + (fieldInfo.offsetBits >> 3)
          let raw: bigint
          if (at + 8 <= buffer.length) raw = buffer.readBigUInt64LE(at)
          else { padded.fill(0); buffer.copy(padded, 0, at, buffer.length); raw = padded.readBigUInt64LE(0) }
          const packed = (raw >> BigInt(fieldInfo.offsetBits & 7)) & ((1n << BigInt(fieldInfo.sizeBits)) - 1n)
          if (fieldInfo.compression === Compression.IndexedArray) {
            const length = fieldInfo.packing[2]
            const values: number[] = []
            for (let i = 0; i < length; i++) values.push(cast(pallet[fieldIndex]![Number(packed) * length + i] ?? 0, field))
            value = values
          } else if (fieldInfo.compression === Compression.Indexed) value = cast(pallet[fieldIndex]![Number(packed)] ?? 0, field)
          else if (fieldInfo.compression === Compression.Signed) value = Number(BigInt.asIntN(fieldInfo.sizeBits, packed))
          else value = cast(packed, field)
        }
        if (id === undefined && fieldIndex === idIndex && typeof value === 'number') id = value
        if (!pick || pick.has(field.name) || field.id) row[field.name] = value
        fieldIndex++
      }
      if (id === undefined) continue
      row.ID ??= id
      rows.set(id, row)
    }
  }
  for (const [destination, source] of copies) { const row = rows.get(source); if (row) rows.set(destination, { ...row, ID: destination }) }
  return rows
}
