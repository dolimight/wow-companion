import type { BrowserWindow, Rectangle } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export type WindowPlacement = { bounds: Rectangle; maximized: boolean; fullScreen: boolean }
export const minimumWindowSize = { minWidth: 820, minHeight: 650 }

export function readWindowPlacement(file: string, workAreas: Rectangle[]): WindowPlacement {
  let saved: Partial<WindowPlacement> = {}
  try { saved = JSON.parse(readFileSync(file, 'utf8')) ?? {} } catch { /* Missing or damaged preferences use defaults */ }
  const candidate = saved.bounds
  const valid = candidate && ['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(candidate[key as keyof Rectangle])) && candidate.width > 0 && candidate.height > 0
  const primary = workAreas[0]
  const overlap = (area: Rectangle) => valid ? Math.max(0, Math.min(candidate.x + candidate.width, area.x + area.width) - Math.max(candidate.x, area.x)) * Math.max(0, Math.min(candidate.y + candidate.height, area.y + area.height) - Math.max(candidate.y, area.y)) : 0
  const area = workAreas.reduce((best, next) => overlap(next) > overlap(best) ? next : best, primary)
  const width = Math.max(minimumWindowSize.minWidth, Math.min(valid ? candidate.width : 1460, area.width))
  const height = Math.max(minimumWindowSize.minHeight, Math.min(valid ? candidate.height : 1050, area.height))
  const x = Math.max(area.x, Math.min(valid ? candidate.x : area.x + Math.round((area.width - width) / 2), area.x + Math.max(0, area.width - width)))
  const y = Math.max(area.y, Math.min(valid ? candidate.y : area.y + Math.round((area.height - height) / 2), area.y + Math.max(0, area.height - height)))
  return { bounds: { x, y, width, height }, maximized: saved.maximized === true, fullScreen: saved.fullScreen === true }
}

/** Save before Electron tears down native window state, including app.quit and updater restarts */
export function rememberWindowPlacement(window: BrowserWindow, file: string, placement: WindowPlacement) {
  let maximized = placement.maximized
  let bounds = placement.bounds
  const rememberBounds = () => {
    if (!window.isMaximized() && !window.isFullScreen() && !window.isMinimized()) bounds = window.getBounds()
  }
  window.on('resize', rememberBounds)
  window.on('move', rememberBounds)
  window.on('maximize', () => { maximized = true })
  window.on('unmaximize', () => { if (!window.isFullScreen()) maximized = false })
  const save = () => {
    if (window.isDestroyed()) return
    const state: WindowPlacement = { bounds, maximized, fullScreen: window.isFullScreen() }
    try {
      writeFileSync(file + '.tmp', JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      renameSync(file + '.tmp', file)
    } catch (error) { console.warn('Window placement could not be saved', error) }
  }
  window.on('close', save)
  return { save, restore: () => {
    if (placement.maximized) window.maximize()
    if (placement.fullScreen) window.setFullScreen(true)
  } }
}
