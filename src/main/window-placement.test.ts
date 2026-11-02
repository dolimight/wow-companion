import { afterEach, describe, expect, it } from 'vite-plus/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWindowPlacement } from './window-placement'

const folders: string[] = []
const primary = { x: 0, y: 0, width: 1920, height: 1040 }
function preference(value?: unknown) {
  const folder = mkdtempSync(join(tmpdir(), 'wow-window-'))
  folders.push(folder)
  const file = join(folder, 'window-placement.json')
  if (value !== undefined) writeFileSync(file, JSON.stringify(value))
  return file
}
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('window placement recovery', () => {
  it('uses usable centered defaults for a new profile', () => {
    expect(readWindowPlacement(preference(), [primary])).toEqual({ bounds: { x: 230, y: 0, width: 1460, height: 1040 }, maximized: false, fullScreen: false })
  })
  it('keeps saved bounds on a secondary monitor with negative coordinates', () => {
    const bounds = { x: -1600, y: 80, width: 1200, height: 800 }
    expect(readWindowPlacement(preference({ bounds, maximized: true, fullScreen: true }), [primary, { ...primary, x: -1920 }])).toEqual({ bounds, maximized: true, fullScreen: true })
  })
  it('brings a disconnected-monitor window back onto the primary work area', () => {
    const saved = { bounds: { x: 3000, y: -1200, width: 2500, height: 1400 }, fullScreen: true }
    expect(readWindowPlacement(preference(saved), [primary])).toEqual({ bounds: primary, maximized: false, fullScreen: true })
  })
  it('keeps the title bar and edges reachable after a work area shrinks', () => {
    const bounds = readWindowPlacement(preference({ bounds: { x: 1800, y: 950, width: 1000, height: 700 } }), [primary]).bounds
    expect(bounds).toEqual({ x: 920, y: 340, width: 1000, height: 700 })
  })
  it('rejects damaged geometry and non-boolean modes', () => {
    const file = preference({ bounds: { x: 'bad', y: 0, width: -1, height: 700 }, maximized: 'true', fullScreen: 1 })
    expect(readWindowPlacement(file, [primary])).toEqual(readWindowPlacement(preference(), [primary]))
    writeFileSync(file, '{broken')
    expect(readWindowPlacement(file, [primary])).toEqual(readWindowPlacement(preference(), [primary]))
  })
  it('enforces the supported minimum size', () => {
    expect(readWindowPlacement(preference({ bounds: { x: 20, y: 30, width: 10, height: 10 } }), [primary]).bounds).toEqual({ x: 20, y: 30, width: 820, height: 650 })
  })
})
