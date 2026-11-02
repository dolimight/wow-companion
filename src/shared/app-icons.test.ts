import { expect, it } from 'vite-plus/test'
import { appIconSchema, resolveAppIcon } from './app-icons'

it('uses the build version for automatic icons and preserves explicit choices', () => {
  expect(resolveAppIcon('auto', '0.1.1-nightly.20261102.18')).toBe('nightly')
  expect(resolveAppIcon('auto', '0.1.1')).toBe('classic')
  for (const choice of ['classic', 'nightly', 'halloween'] as const) {
    expect(resolveAppIcon(choice, '0.1.1')).toBe(choice)
    expect(resolveAppIcon(choice, '0.1.1-nightly.20261102.18')).toBe(choice)
  }
  expect(appIconSchema.safeParse('../untrusted.png').success).toBe(false)
})
