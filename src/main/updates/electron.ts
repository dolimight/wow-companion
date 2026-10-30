import updaterPackage from 'electron-updater'
import type { UpdaterAdapter } from './service'
const { autoUpdater } = updaterPackage

export function electronUpdaterAdapter(): UpdaterAdapter {
  return {
    configure(channel) {
      autoUpdater.setFeedURL({ provider: 'github', owner: 'dolimight', repo: 'wow-companion' })
      autoUpdater.channel = channel === 'stable' ? 'latest' : 'nightly'
      autoUpdater.allowPrerelease = channel === 'nightly'
      autoUpdater.allowDowngrade = false
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = false
      autoUpdater.fullChangelog = channel === 'nightly'
    },
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    install: () => autoUpdater.quitAndInstall(true, true),
    on: (event, listener) => { autoUpdater.on(event as Parameters<typeof autoUpdater.on>[0], listener) },
    off: (event, listener) => { autoUpdater.removeListener(event as Parameters<typeof autoUpdater.removeListener>[0], listener) },
  }
}
