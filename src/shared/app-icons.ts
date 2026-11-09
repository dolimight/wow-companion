import { z } from 'zod'

export const appIconSchema = z.enum(['auto', 'classic', 'nightly', 'newyear', 'valentine', 'stpatrick', 'easter', 'independence', 'halloween', 'thanksgiving', 'christmas'])
export type AppIconPreference = z.infer<typeof appIconSchema>
export type AppIconVariant = Exclude<AppIconPreference, 'auto'>
export const appIconChoices = [
  { value: 'auto', label: 'Build default' },
  { value: 'classic', label: 'Classic blue' },
  { value: 'nightly', label: 'Nightly purple' },
  { value: 'newyear', label: 'New Year’s' },
  { value: 'valentine', label: 'Valentine’s Day' },
  { value: 'stpatrick', label: 'St Patrick’s Day' },
  { value: 'easter', label: 'Easter' },
  { value: 'independence', label: 'July 4' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'thanksgiving', label: 'Thanksgiving' },
  { value: 'christmas', label: 'Christmas' },
] satisfies Array<{ value: AppIconPreference; label: string }>

export function resolveAppIcon(preference: AppIconPreference, version: string): AppIconVariant {
  return preference === 'auto' ? version.includes('-nightly.') ? 'nightly' : 'classic' : preference
}
export const appIconFiles: Record<AppIconVariant, { logo: string; png: string; ico: string }> = {
  classic: { logo: 'wow-companion-logo.png', png: 'wow-companion-icon.png', ico: 'wow-companion.ico' },
  nightly: { logo: 'wow-companion-nightly-logo.png', png: 'wow-companion-nightly-icon.png', ico: 'wow-companion-nightly.ico' },
  newyear: { logo: 'wow-companion-newyear-logo.png', png: 'wow-companion-newyear-icon.png', ico: 'wow-companion-newyear.ico' },
  valentine: { logo: 'wow-companion-valentine-logo.png', png: 'wow-companion-valentine-icon.png', ico: 'wow-companion-valentine.ico' },
  stpatrick: { logo: 'wow-companion-stpatrick-logo.png', png: 'wow-companion-stpatrick-icon.png', ico: 'wow-companion-stpatrick.ico' },
  easter: { logo: 'wow-companion-easter-logo.png', png: 'wow-companion-easter-icon.png', ico: 'wow-companion-easter.ico' },
  independence: { logo: 'wow-companion-independence-logo.png', png: 'wow-companion-independence-icon.png', ico: 'wow-companion-independence.ico' },
  halloween: { logo: 'wow-companion-halloween-logo.png', png: 'wow-companion-halloween-icon.png', ico: 'wow-companion-halloween.ico' },
  thanksgiving: { logo: 'wow-companion-thanksgiving-logo.png', png: 'wow-companion-thanksgiving-icon.png', ico: 'wow-companion-thanksgiving.ico' },
  christmas: { logo: 'wow-companion-christmas-logo.png', png: 'wow-companion-christmas-icon.png', ico: 'wow-companion-christmas.ico' },
}
/** Targeting cursor colors taken from each icon's artwork: its color while moving, and the one it shifts to on a control */
export const appIconCursor: Record<AppIconVariant, { color: string; target: string }> = {
  classic: { color: '#30adf9', target: '#74d3fc' },
  nightly: { color: '#9b4dff', target: '#c79bff' },
  newyear: { color: '#f2b632', target: '#f8cf71' },
  valentine: { color: '#e0336a', target: '#ff7aa0' },
  stpatrick: { color: '#1fae4b', target: '#f8d46f' },
  easter: { color: '#3dbb85', target: '#9be6c3' },
  independence: { color: '#2f6bff', target: '#e8333b' },
  halloween: { color: '#f87101', target: '#fb8f04' },
  thanksgiving: { color: '#d4581c', target: '#e8a33d' },
  christmas: { color: '#d12b2b', target: '#2ea44f' },
}
