/** Minimal little-endian cursor over a Buffer, shared by the CASC, DB2, and BLP readers */
export class Reader {
  offset = 0
  constructor(readonly buffer: Buffer) {}
  get length() { return this.buffer.length }
  get remaining() { return this.buffer.length - this.offset }
  seek(offset: number) { this.offset = offset; return this }
  skip(bytes: number) { this.offset += bytes; return this }
  u8() { return this.buffer.readUInt8(this.offset++) }
  i8() { return this.buffer.readInt8(this.offset++) }
  u16() { const v = this.buffer.readUInt16LE(this.offset); this.offset += 2; return v }
  i16() { const v = this.buffer.readInt16LE(this.offset); this.offset += 2; return v }
  u32() { const v = this.buffer.readUInt32LE(this.offset); this.offset += 4; return v }
  i32() { const v = this.buffer.readInt32LE(this.offset); this.offset += 4; return v }
  u64() { const v = this.buffer.readBigUInt64LE(this.offset); this.offset += 8; return v }
  i64() { const v = this.buffer.readBigInt64LE(this.offset); this.offset += 8; return v }
  f32() { const v = this.buffer.readFloatLE(this.offset); this.offset += 4; return v }
  u16be() { const v = this.buffer.readUInt16BE(this.offset); this.offset += 2; return v }
  i32be() { const v = this.buffer.readInt32BE(this.offset); this.offset += 4; return v }
  u32be() { const v = this.buffer.readUInt32BE(this.offset); this.offset += 4; return v }
  /** 40-bit big-endian size used by the encoding table */
  u40be() { const high = this.buffer.readUInt8(this.offset); const low = this.buffer.readUInt32BE(this.offset + 1); this.offset += 5; return high * 2 ** 32 + low }
  hex(bytes: number) { const v = this.buffer.toString('hex', this.offset, this.offset + bytes); this.offset += bytes; return v }
  bytes(count: number) { const v = this.buffer.subarray(this.offset, this.offset + count); this.offset += count; return v }
  /** Reads a NUL-terminated UTF-8 string and moves past the terminator */
  cstring() {
    const end = this.buffer.indexOf(0, this.offset)
    const stop = end === -1 ? this.buffer.length : end
    const v = this.buffer.toString('utf8', this.offset, stop)
    this.offset = stop + 1
    return v
  }
  cstringAt(offset: number) {
    const end = this.buffer.indexOf(0, offset)
    return this.buffer.toString('utf8', offset, end === -1 ? this.buffer.length : end)
  }
}
