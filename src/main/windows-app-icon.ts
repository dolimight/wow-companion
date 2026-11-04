import { execFile } from 'node:child_process'
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

type ShellRunner = (file: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout: number; windowsHide: boolean }, callback: (error: Error | null) => void) => unknown
// Explorer keeps each pinned button's icon in memory and only re-reads the link when told it changed: SHCNE_ASSOCCHANGED drops
// its icon cache first, then SHCNE_UPDATEITEM and SHCNE_ATTRIBUTES per link and SHCNE_UPDATEDIR for the folder as flushed paths
const shellNotifyScript = [
  `Add-Type -Namespace WowShell -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] public static extern void SHChangeNotify(int e, uint f, string a, System.IntPtr b);'`,
  '$request = ConvertFrom-Json $env:WOW_SHELL_REFRESH',
  '[WowShell.Native]::SHChangeNotify(0x08000000, 0x1000, $null, [IntPtr]::Zero)',
  'Start-Sleep -Milliseconds 2000',
  'foreach ($file in @($request.files)) { foreach ($event in 0x2000, 0x800) { [WowShell.Native]::SHChangeNotify($event, 0x1005, $file, [IntPtr]::Zero) } }',
  '[WowShell.Native]::SHChangeNotify(0x1000, 0x1005, $request.directory, [IntPtr]::Zero)',
].join('; ')

/** Ask Explorer to reload pinned links; best effort, since the links are already correct and Explorer rereads them on its next start */
export function refreshPinnedShellItems(directory: string, files: string[], run: ShellRunner = execFile as ShellRunner) {
  if (!files.length) return Promise.resolve(false)
  return new Promise<boolean>(resolve => {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', shellNotifyScript], {
      env: { ...process.env, WOW_SHELL_REFRESH: JSON.stringify({ directory, files }) }, timeout: 20_000, windowsHide: true,
    }, error => resolve(!error))
  })
}

export function taskbarDetails(executable: string, icon: string, developmentApp?: string): AppDetailsOptions {
  return {
    appId: windowsAppId, appIconPath: icon, appIconIndex: 0,
    relaunchCommand: `"${executable}"${developmentApp ? ` "${developmentApp}"` : ''}`,
    relaunchDisplayName: 'WOW Companion',
  }
}

/** Update only existing links for this executable; preserve arguments, identity, and all other properties */
export async function updatePinnedAppIcons(directory: string, executable: string, icon: string, shell: ShortcutShell, developmentApp?: string, onMatched?: (files: string[]) => Promise<unknown>) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  let updated = 0
  const matched: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.lnk') continue
    const file = path.join(directory, entry.name)
    let link: ShortcutDetails
    try { link = shell.readShortcutLink(file) } catch { continue }
    if (!samePath(link.target, executable)) continue
    if (link.appUserModelId && link.appUserModelId !== windowsAppId) continue
    // electron.exe is shared by development apps; never retarget an unrelated Electron pin
    if (developmentApp && link.args !== developmentApp && link.args !== `"${developmentApp}"`) continue
    matched.push(file)
    if (link.icon && samePath(link.icon, icon) && link.iconIndex === 0) continue
    if (!shell.writeShortcutLink(file, 'update', { target: link.target, icon, iconIndex: 0 })) {
      throw new Error('Windows could not update the pinned WOW Companion icon — unpin and pin the app again')
    }
    updated++
  }
  // Even a link that is already correct can be on screen with a stale icon, so Explorer is told about every pin of this app
  if (matched.length) await onMatched?.(matched)
  return updated
}
