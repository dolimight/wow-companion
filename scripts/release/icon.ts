import { appIconFiles, resolveAppIcon } from '../../src/shared/app-icons.ts'

export function installerIcon(version: string) {
  return `public/assets/${appIconFiles[resolveAppIcon('auto', version)].ico}`
}
