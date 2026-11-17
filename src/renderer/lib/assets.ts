/** Icons the app ships with (public/assets/icons), listed by scripts/encounter-data.ts */
const manifests = import.meta.glob<number[]>('../../../data/dungeons/encounters/icons.json', { eager: true, import: 'default' })
const bundledIcons = new Set(Object.values(manifests).flat())

/**
 * A bundled icon needs no game files; any other comes through the private asset protocol in desktop builds, and the
 * browser development server proxies the same files
 */
export function iconUrl(fileDataId: number | null | undefined) {
  if (!fileDataId) return null
  if (bundledIcons.has(fileDataId)) return `${import.meta.env.BASE_URL}assets/icons/${fileDataId}.png`
  return window.companion ? `wow-asset://icons/${fileDataId}.png` : `/__icons/${fileDataId}.png`
}

export function assetUrl(handle: string | null | undefined) {
  if (!handle) return null
  if (window.companion) return handle
  const match = handle.match(/^wow-asset:\/\/renders\/([\w-]+\.(?:png|jpg|webp))$/)
  return match ? `/__renders/${match[1]}` : null
}
