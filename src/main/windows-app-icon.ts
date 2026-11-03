import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppDetailsOptions, ShortcutDetails } from 'electron'

export const windowsAppId = 'local.wowcompanion.desktop'
type ShortcutShell = {
  readShortcutLink(file: string): ShortcutDetails
  writeShortcutLink(file: string, operation: 'update', details: ShortcutDetails): boolean
}
const samePath = (a: string, b: string) => path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase()

/** Retain icons outside the versioned installation directory for Windows' pinned links */
export async function persistWindowsIcon(source: string, directory: string) {
  const destination = path.join(directory, path.basename(source))
  const bytes = await readFile(source)
  const previous = await readFile(destination).catch(() => null)
  if (!previous?.equals(bytes)) {
    await mkdir(directory, { recursive: true })
    await writeFile(destination, bytes)
  }
  return destination
}

export function taskbarDetails(executable: string, icon: string, developmentApp?: string): AppDetailsOptions {
  return {
    appId: windowsAppId, appIconPath: icon, appIconIndex: 0,
    relaunchCommand: `"${executable}"${developmentApp ? ` "${developmentApp}"` : ''}`,
    relaunchDisplayName: 'WOW Companion',
  }
}

/** Update only existing links for this executable; preserve arguments, identity, and all other properties */
export async function updatePinnedAppIcons(directory: string, executable: string, icon: string, shell: ShortcutShell, developmentApp?: string) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  let updated = 0
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.lnk') continue
    const file = path.join(directory, entry.name)
    let link: ShortcutDetails
    try { link = shell.readShortcutLink(file) } catch { continue }
    if (!samePath(link.target, executable)) continue
    if (link.appUserModelId && link.appUserModelId !== windowsAppId) continue
    // electron.exe is shared by development apps; never retarget an unrelated Electron pin
    if (developmentApp && link.args !== developmentApp && link.args !== `"${developmentApp}"`) continue
    if (link.icon && samePath(link.icon, icon) && link.iconIndex === 0) continue
    if (!shell.writeShortcutLink(file, 'update', { target: link.target, icon, iconIndex: 0 })) {
      throw new Error('Windows could not update the pinned WOW Companion icon — unpin and pin the app again')
    }
    updated++
  }
  return updated
}
