import { describe, expect, it } from 'vite-plus/test'
import { alertRoute } from './alert-route'

describe('alert routing', () => {
  it('shows alerts inside the app while its window is on screen', () => {
    expect(alertRoute({ visible: true, minimized: false })).toBe('app')
  })
  it('uses system notifications when the app is only in the tray, minimized, or has no window', () => {
    expect(alertRoute({ visible: false, minimized: false })).toBe('system')
    expect(alertRoute({ visible: true, minimized: true })).toBe('system')
    expect(alertRoute(null)).toBe('system')
  })
  it('always sends a test alert to the system', () => {
    expect(alertRoute({ visible: true, minimized: false }, { system: true })).toBe('system')
  })
})
