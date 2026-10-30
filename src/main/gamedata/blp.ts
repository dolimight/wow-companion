/*
 * BLP2 texture decoding to RGBA and PNG encoding for item icons
 * Format handling follows wow.export's BLP reader (MIT, Kruithne and Marlamin)
 */
import { crc32, deflateSync } from 'node:zlib'
import { Reader } from './binary'

export type Rgba = { width: number; height: number; pixels: Buffer }

function color565(value: number): [number, number, number] {
  return [((value >> 11) & 0x1f) * 255 / 31, ((value >> 5) & 0x3f) * 255 / 63, (value & 0x1f) * 255 / 31]
}

/** Decodes DXT1, DXT3, and DXT5 blocks */
function decodeDxt(data: Buffer, width: number, height: number, format: 1 | 3 | 5): Buffer {
  const out = Buffer.alloc(width * height * 4)
  const blockSize = format === 1 ? 8 : 16
  let offset = 0
  for (let by = 0; by < Math.max(1, height / 4); by++) {
    for (let bx = 0; bx < Math.max(1, width / 4); bx++) {
      if (offset + blockSize > data.length) return out
      const alpha = new Array<number>(16).fill(255)
      let colorOffset = offset
      if (format === 3) {
        for (let i = 0; i < 8; i++) { const byte = data[offset + i]!; alpha[i * 2] = (byte & 0x0f) * 17; alpha[i * 2 + 1] = (byte >> 4) * 17 }
        colorOffset += 8
      } else if (format === 5) {
        const a0 = data[offset]!, a1 = data[offset + 1]!
        const table = [a0, a1]
        if (a0 > a1) for (let i = 1; i < 7; i++) table.push(((7 - i) * a0 + i * a1) / 7)
        else { for (let i = 1; i < 5; i++) table.push(((5 - i) * a0 + i * a1) / 5); table.push(0, 255) }
        let bits = 0n
        for (let i = 0; i < 6; i++) bits |= BigInt(data[offset + 2 + i]!) << BigInt(8 * i)
        for (let i = 0; i < 16; i++) alpha[i] = table[Number((bits >> BigInt(3 * i)) & 7n)]!
        colorOffset += 8
      }
      const c0 = data.readUInt16LE(colorOffset), c1 = data.readUInt16LE(colorOffset + 2)
      const p0 = color565(c0), p1 = color565(c1)
      const palette: Array<[number, number, number, number]> = [[...p0, 255], [...p1, 255]]
      if (format !== 1 || c0 > c1) {
        palette.push([(2 * p0[0] + p1[0]) / 3, (2 * p0[1] + p1[1]) / 3, (2 * p0[2] + p1[2]) / 3, 255], [(p0[0] + 2 * p1[0]) / 3, (p0[1] + 2 * p1[1]) / 3, (p0[2] + 2 * p1[2]) / 3, 255])
      } else palette.push([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, 255], [0, 0, 0, 0])
      const indices = data.readUInt32LE(colorOffset + 4)
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i % 4), y = by * 4 + Math.floor(i / 4)
        if (x >= width || y >= height) continue
        const color = palette[(indices >>> (2 * i)) & 3]!
        const at = (y * width + x) * 4
        out[at] = color[0]; out[at + 1] = color[1]; out[at + 2] = color[2]
        out[at + 3] = format === 1 ? color[3] : alpha[i]!
      }
      offset += blockSize
    }
  }
  return out
}

/** Decodes the largest mipmap of a BLP2 texture */
export function decodeBlp(buffer: Buffer): Rgba {
  const reader = new Reader(buffer)
  if (buffer.toString('latin1', 0, 4) !== 'BLP2') throw new Error('Unsupported texture format')
  reader.seek(8)
  const compression = reader.u8(), alphaDepth = reader.u8(), alphaType = reader.u8()
  reader.skip(1)
  const width = reader.u32(), height = reader.u32()
  const offsets: number[] = [], sizes: number[] = []
  for (let i = 0; i < 16; i++) offsets.push(reader.u32())
  for (let i = 0; i < 16; i++) sizes.push(reader.u32())
  const data = buffer.subarray(offsets[0]!, offsets[0]! + sizes[0]!)
  if (compression === 2) {
    const format = alphaDepth <= 1 ? 1 : alphaType === 7 ? 5 : 3
    return { width, height, pixels: decodeDxt(data, width, height, format) }
  }
  const pixels = Buffer.alloc(width * height * 4)
  if (compression === 3) {
    for (let i = 0; i < width * height; i++) { pixels[i * 4] = data[i * 4 + 2]!; pixels[i * 4 + 1] = data[i * 4 + 1]!; pixels[i * 4 + 2] = data[i * 4]!; pixels[i * 4 + 3] = data[i * 4 + 3]! }
    return { width, height, pixels }
  }
  if (compression === 1) {
    const palette = new Reader(buffer).seek(148)
    const colors: number[] = []
    for (let i = 0; i < 256; i++) colors.push(palette.u32())
    const count = width * height
    for (let i = 0; i < count; i++) {
      const color = colors[data[i]!]!
      pixels[i * 4] = (color >> 16) & 0xff; pixels[i * 4 + 1] = (color >> 8) & 0xff; pixels[i * 4 + 2] = color & 0xff
      let alpha = 255
      if (alphaDepth === 1) alpha = (data[count + (i >> 3)]! >> (i & 7)) & 1 ? 255 : 0
      else if (alphaDepth === 4) alpha = ((data[count + (i >> 1)]! >> ((i & 1) * 4)) & 0x0f) * 17
      else if (alphaDepth === 8) alpha = data[count + i]!
      pixels[i * 4 + 3] = alpha
    }
    return { width, height, pixels }
  }
  throw new Error(`Unsupported texture compression ${compression}`)
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

export function encodePng({ width, height, pixels }: Rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
