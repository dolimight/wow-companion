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
  const identity = appIdentity(!developmentApp)
  return {
    appId: identity.appId, appIconPath: icon, appIconIndex: 0,
    relaunchCommand: `"${executable}"${developmentApp ? ` "${developmentApp}"` : ''}`,
    relaunchDisplayName: identity.displayName,
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

/**
 * Who the app is to the system. Development runs get their own name, data folder, Windows ID, and notification
 * activator, so they never share a database or single-instance lock with the installed app, and never register
 * electron.exe as the activator for the installed app's notifications
 */
export function appIdentity(packaged: boolean) {
  return packaged
    ? { appId: windowsAppId, activator: '{9E1838B3-D189-4651-AF88-03B4767F6514}', displayName: 'WOW Companion', dataFolder: 'wow-companion' }
    : { appId: `${windowsAppId}.dev`, activator: '{D3633270-7051-46F8-9CC3-A54E0B712F10}', displayName: 'WOW Companion Dev', dataFolder: 'wow-companion-dev' }
}
export type AppIdentity = ReturnType<typeof appIdentity>

type RegistryRunner = (file: string, args: string[], options: { timeout: number; windowsHide: boolean }, callback: (error: Error | null) => void) => unknown
/**
 * Names the toast identity in the per-user registry, so Windows shows the app's name and icon on its notifications
 * and routes a click, even from Action Center after a restart, to the activator class. Without it Windows can fall
 * back to a cached Electron identity. Best effort: a failed write leaves the shortcut-based name in place
 */
export async function registerToastIdentity(identity: AppIdentity, icon: string, launch: string, run: RegistryRunner = execFile as RegistryRunner) {
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${identity.appId}`
  // Electron registers the activator only while it runs; this lets a click start the app when it's closed
  const server = `HKCU\\Software\\Classes\\CLSID\\${identity.activator}\\LocalServer32`
  const writes: Array<[string, string | null, string]> = [[key, 'DisplayName', identity.displayName], [key, 'IconUri', icon], [key, 'CustomActivator', identity.activator], [server, null, launch]]
  const results = await Promise.all(writes.map(([target, name, data]) => new Promise<boolean>(resolve => {
    run('reg.exe', ['add', target, ...(name ? ['/v', name] : ['/ve']), '/t', 'REG_SZ', '/d', data, '/f'], { timeout: 10_000, windowsHide: true }, error => resolve(!error))
  })))
  return results.every(Boolean)
}

/**
 * Points the installed Start Menu shortcut at the app's fixed notification activator. Windows routes a toast click
 * through this shortcut, and the installer's copy names whatever class Electron picked on an earlier run, which can
 * start a stray copy instead of focusing the open one. Only this executable's link with this app ID is touched
 */
export function alignShortcutActivator(file: string, executable: string, identity: AppIdentity, shell: ShortcutShell) {
  let link: ShortcutDetails
  try { link = shell.readShortcutLink(file) } catch { return false }
  if (!samePath(link.target, executable) || link.appUserModelId !== identity.appId) return false
  const wanted = identity.activator.replace(/[{}]/g, '').toLowerCase()
  if ((link.toastActivatorClsid ?? '').replace(/[{}]/g, '').toLowerCase() === wanted) return false
  return shell.writeShortcutLink(file, 'update', { target: link.target, toastActivatorClsid: identity.activator })
}
