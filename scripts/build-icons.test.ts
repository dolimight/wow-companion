import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleBounds, encodeIco, encodeIcns } from './build-icons.ts'

test('icon crop excludes transparent padding and rejects empty or malformed images', () => {
  const pixels = Buffer.alloc(4 * 4 * 4)
  pixels[(1 * 4 + 1) * 4 + 3] = 255; pixels[(2 * 4 + 2) * 4 + 3] = 128
  assert.deepEqual(visibleBounds(pixels, 4, 4), { x: 1, y: 1, width: 2, height: 2 })
  assert.throws(() => visibleBounds(Buffer.alloc(64), 4, 4), /no visible pixels/)
  assert.throws(() => visibleBounds(Buffer.alloc(2), 4, 4), /bitmap size/)
})
test('ICO directory offsets retain all size payloads including the 256px encoding', () => {
  const result = encodeIco([{ size: 16, png: Buffer.from('small') }, { size: 256, png: Buffer.from('large') }])
  assert.equal(result.readUInt16LE(2), 1); assert.equal(result.readUInt16LE(4), 2)
  assert.equal(result[22], 0)
  assert.equal(result.readUInt32LE(18), 38); assert.equal(result.readUInt32LE(34), 43)
  assert.equal(result.subarray(38).toString(), 'smalllarge')
})
test('ICNS encodes big-endian container and chunk lengths', () => {
  const result = encodeIcns([{ type: 'ic10', png: Buffer.from('image') }])
  assert.equal(result.toString('ascii', 0, 4), 'icns'); assert.equal(result.readUInt32BE(4), result.length)
  assert.equal(result.toString('ascii', 8, 12), 'ic10'); assert.equal(result.readUInt32BE(12), 13)
  assert.equal(result.subarray(16).toString(), 'image')
})
