import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { minimumWindowSize, readWindowPlacement, rememberWindowPlacement } from './window-placement'

/** Real native window close/reopen coverage against the acceptance profile only */
export async function checkWindowPlacement(outputDir: string) {
  const file = join(outputDir, 'window-placement-test.json')
  const areas = [screen.getPrimaryDisplay().workArea, ...screen.getAllDisplays().map(display => display.workArea)]
  const until = async (check: () => boolean, label: string) => {
    const deadline = Date.now() + 5000
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`Window placement: ${label}`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  const create = () => {
    const placement = readWindowPlacement(file, areas)
    const window = new BrowserWindow({ ...placement.bounds, ...minimumWindowSize, show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    const remembered = rememberWindowPlacement(window, file, placement)
    remembered.restore()
    return window
  }
  let window = create()
  try {
    window.setBounds({ x: areas[0].x, y: areas[0].y, width: Math.max(minimumWindowSize.minWidth, Math.min(900, areas[0].width)), height: Math.max(minimumWindowSize.minHeight, Math.min(700, areas[0].height)) })
    const normal = window.getNormalBounds()
    for (const mode of ['normal', 'maximized', 'fullscreen', 'minimized'] as const) {
      if (mode === 'maximized') window.maximize()
      if (mode === 'fullscreen') window.setFullScreen(true)
      if (mode === 'minimized') {
        window.setFullScreen(false)
        await until(() => !window.isFullScreen(), 'leave fullscreen')
        window.maximize()
        window.minimize()
      }
      if (mode === 'maximized') await until(() => window.isMaximized(), 'maximize')
      if (mode === 'fullscreen') await until(() => window.isFullScreen(), 'enter fullscreen')
      if (mode === 'minimized') await until(() => window.isMinimized(), 'minimize')
      window.close()
      await until(() => window.isDestroyed(), 'close')
      window = create()
      await until(() => mode === 'fullscreen' ? window.isFullScreen() : mode === 'normal' ? !window.isMaximized() && !window.isFullScreen() : window.isMaximized() && !window.isMinimized(), `restore ${mode}`)
      const restored = window.getNormalBounds()
      // Windows reports maximized geometry through getNormalBounds in fullscreen
      // Check the saved normal bounds and verify native geometry outside fullscreen
      const saved = readWindowPlacement(file, areas)
      if (JSON.stringify(saved.bounds) !== JSON.stringify(normal)) throw new Error(`Window placement: saved normal bounds changed after ${mode}: ${JSON.stringify({ normal, saved })}`)
      if (mode !== 'fullscreen' && JSON.stringify(restored) !== JSON.stringify(normal)) throw new Error(`Window placement: normal bounds changed after ${mode}: ${JSON.stringify({ normal, restored })}`)
    }
    window.unmaximize()
    await until(() => !window.isMaximized() && JSON.stringify(window.getBounds()) === JSON.stringify(normal), 'restore original normal size')
    window.close()
    await until(() => window.isDestroyed(), 'close restored window')
    window = create()
    if (window.isMaximized() || window.isFullScreen()) throw new Error('Window placement: old mode returned after restoring to normal')
    window.setFullScreen(true)
    await until(() => window.isFullScreen(), 'fullscreen from normal')
    window.close()
    await until(() => window.isDestroyed(), 'close fullscreen from normal')
    window = create()
    await until(() => window.isFullScreen(), 'reopen fullscreen from normal')
    window.setFullScreen(false)
    await until(() => !window.isFullScreen() && !window.isMaximized() && JSON.stringify(window.getBounds()) === JSON.stringify(normal), 'leave fullscreen at original size')
    return { normalBounds: normal, modes: ['normal', 'maximized', 'fullscreen from maximized', 'minimized returns maximized', 'restored normal', 'fullscreen from normal'] }
  } finally { if (!window.isDestroyed()) window.destroy() }
}
