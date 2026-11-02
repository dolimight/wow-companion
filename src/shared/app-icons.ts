import { z } from 'zod'

export const appIconSchema = z.enum(['auto', 'classic', 'nightly', 'halloween'])
export type AppIconPreference = z.infer<typeof appIconSchema>
export type AppIconVariant = Exclude<AppIconPreference, 'auto'>
export const appIconChoices = [
  { value: 'auto', label: 'Build default' },
  { value: 'classic', label: 'Classic blue' },
  { value: 'nightly', label: 'Nightly purple' },
  { value: 'halloween', label: 'Halloween' },
] satisfies Array<{ value: AppIconPreference; label: string }>

export function resolveAppIcon(preference: AppIconPreference, version: string): AppIconVariant {
  return preference === 'auto' ? version.includes('-nightly.') ? 'nightly' : 'classic' : preference
}
export const appIconFiles: Record<AppIconVariant, { logo: string; png: string; ico: string }> = {
  classic: { logo: 'wow-companion-logo.png', png: 'wow-companion-icon.png', ico: 'wow-companion.ico' },
  nightly: { logo: 'wow-companion-nightly-logo.png', png: 'wow-companion-nightly-icon.png', ico: 'wow-companion-nightly.ico' },
  halloween: { logo: 'wow-companion-halloween-logo.png', png: 'wow-companion-halloween-icon.png', ico: 'wow-companion-halloween.ico' },
}
