/** Desktop builds use the private asset protocol; the browser development server proxies the same files */
export function iconUrl(fileDataId: number | null | undefined) {
  if (!fileDataId) return null
  return window.companion ? `wow-asset://icons/${fileDataId}.png` : `/__icons/${fileDataId}.png`
}

export function assetUrl(handle: string | null | undefined) {
  if (!handle) return null
  if (window.companion) return handle
  const match = handle.match(/^wow-asset:\/\/renders\/([\w-]+\.(?:png|jpg|webp))$/)
  return match ? `/__renders/${match[1]}` : null
}
