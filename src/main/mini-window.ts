import { BrowserWindow, globalShortcut, screen, type BrowserWindowConstructorOptions } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

/** Play mode's own small window, kept on top of the game, with global keys to step bosses without leaving the game */
export const miniRoute = /^#\/mini\/[\w-]{1,100}\/(dungeons|raids)\?[\w=&%.-]{1,300}$/
export const playKeys = { next: 'CommandOrControl+Shift+Right', back: 'CommandOrControl+Shift+Left' } as const

type Bounds = { x: number; y: number; width: number; height: number }
const defaults = { width: 440, height: 680 }

/** The saved bounds when they still land on a display, otherwise the default size near the top right of the primary one */
function placement(file: string): Partial<Bounds> & { width: number; height: number } {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Bounds
    const fits = screen.getAllDisplays().some(({ workArea: area }) => saved.x >= area.x && saved.y >= area.y && saved.x + 80 <= area.x + area.width && saved.y + 40 <= area.y + area.height)
    if (fits && saved.width >= 360 && saved.height >= 360) return saved
  } catch { /* first open, or an unreadable file */ }
  const area = screen.getPrimaryDisplay().workArea
  return { ...defaults, x: area.x + area.width - defaults.width - 24, y: area.y + 24 }
}

export function createMiniWindow(options: { file: string; base: string; window: BrowserWindowConstructorOptions; harden: (window: BrowserWindow) => void }) {
  let mini: BrowserWindow | null = null
  const unregister = () => { for (const key of Object.values(playKeys)) globalShortcut.unregister(key) }
  return {
    get window() { return mini },
    /** Opens or refocuses the window on a play mode route, such as #/mini/<id>/dungeons?dungeon=x&play=1 */
    async open(route: string) {
      if (!miniRoute.test(route)) throw new Error('Not a play mode page')
      if (mini && !mini.isDestroyed()) { await mini.loadURL(options.base + route); mini.show(); mini.focus(); return }
      mini = new BrowserWindow({ ...options.window, ...placement(options.file), minWidth: 360, minHeight: 360, alwaysOnTop: true, show: false })
      mini.setAlwaysOnTop(true, 'floating')
      options.harden(mini)
      const save = () => { if (mini && !mini.isDestroyed() && !mini.isMinimized()) try { writeFileSync(options.file, JSON.stringify(mini.getBounds())) } catch { /* not saved this time */ } }
      mini.on('moved', save)
      mini.on('resized', save)
      mini.on('close', save)
      mini.on('closed', () => { mini = null; unregister() })
      mini.once('ready-to-show', () => mini?.show())
      // The keys step the boss from inside the game, where the app never has focus
      const send = (delta: number) => { if (mini && !mini.isDestroyed()) mini.webContents.send('companion:play-step', delta) }
      globalShortcut.register(playKeys.next, () => send(1))
      globalShortcut.register(playKeys.back, () => send(-1))
      await mini.loadURL(options.base + route)
    },
    close() { if (mini && !mini.isDestroyed()) mini.close() },
    dispose: unregister,
  }
}
