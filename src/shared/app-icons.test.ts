import { expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appIconSchema, appIconChoices, appIconFiles, resolveAppIcon } from './app-icons'

it('uses the build version for automatic icons and preserves explicit choices', () => {
  expect(resolveAppIcon('auto', '0.1.1-nightly.20261102.18')).toBe('nightly')
  expect(resolveAppIcon('auto', '0.1.1')).toBe('classic')
  for (const { value } of appIconChoices.filter(choice => choice.value !== 'auto')) {
    expect(resolveAppIcon(value, '0.1.1')).toBe(value)
    expect(resolveAppIcon(value, '0.1.1-nightly.20261102.18')).toBe(value)
  }
  expect(appIconSchema.safeParse('../untrusted.png').success).toBe(false)
})

it('ships a usable square PNG and complete native icon containers for every picker choice', () => {
  for (const files of Object.values(appIconFiles)) {
    const logo = readFileSync(resolve('public/assets', files.logo))
    expect(logo.subarray(1, 4).toString()).toBe('PNG')
    const png = readFileSync(resolve('public/assets', files.png))
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    const ico = readFileSync(resolve('public/assets', files.ico))
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(7)
    const icns = readFileSync(resolve('public/assets', files.ico.replace('.ico', '.icns')))
    expect(icns.subarray(0, 4).toString()).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
  }
})
