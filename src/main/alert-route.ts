/** Where an alert goes: a card inside the app while its window is on screen, a system notification otherwise */
export type AlertRoute = 'app' | 'system'

export function alertRoute(window: { visible: boolean; minimized: boolean } | null, options: { system?: boolean } = {}): AlertRoute {
  // A test alert checks the system notification itself, so it always goes there
  if (options.system) return 'system'
  // Kept in the tray or minimized, the player can't see the app, so the system tells them
  return window && window.visible && !window.minimized ? 'app' : 'system'
}
