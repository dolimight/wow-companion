import { BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { appIconCursor } from '../shared/app-icons'
import { splashBackground, splashHtml, type SplashOptions } from './splash-page'

/** Shown while the database, local services, and first page load; closes once the main window is on screen */
export async function openSplash(options: Omit<SplashOptions, 'logo'> & { logoPath: string; icon: string }) {
  const logo = await readFile(options.logoPath).catch(() => null)
  if (!logo) return null
  const window = new BrowserWindow({
    width: 680, height: 380, frame: false, resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false,
    center: true, show: false, backgroundColor: splashBackground(appIconCursor[options.variant]?.color ?? '#30adf9'), title: 'WOW Companion', icon: options.icon, roundedCorners: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, spellcheck: false },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  const shownAt = Date.now()
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml({ ...options, logo }))).catch(() => {})
  const run = (script: string) => window.isDestroyed() ? Promise.resolve() : window.webContents.executeJavaScript(script).catch(() => {})
  return {
    step: (text: string, share: number) => void run(`window.setStep(${JSON.stringify(text)}, ${Number(share) || 0})`),
    /** Fades out after a short minimum, so a fast start doesn't flash the splash */
    async close() {
      if (window.isDestroyed()) return
      await run(`window.setStep('Ready', 1)`)
      const wait = Math.max(0, 900 - (Date.now() - shownAt))
      await new Promise(resolve => setTimeout(resolve, wait))
      await run('window.leave()')
      await new Promise(resolve => setTimeout(resolve, options.reducedMotion ? 0 : 230))
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
