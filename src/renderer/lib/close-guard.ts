import { useEffect, useRef } from 'react'

/** Editors with unsaved work, newest last; the newest one answers a window close */
const guards: Array<{ current: () => void }> = []

/** Registers an editor's answer to a window close; returns the call that removes it */
export function addCloseGuard(handler: { current: () => void }) {
  guards.push(handler)
  return () => { const index = guards.indexOf(handler); if (index >= 0) guards.splice(index, 1) }
}

/** Asks the open editor what to do when the window closes with its work unsaved */
export function useCloseGuard(active: boolean, onRequest: () => void) {
  const handler = useRef(onRequest)
  handler.current = onRequest
  useEffect(() => active ? addCloseGuard(handler) : undefined, [active])
}

/** Routes the main process close request to the editor that blocked it, or closes when nothing is waiting */
export function handleCloseRequest(close: () => void) {
  const guard = guards.at(-1)
  if (guard) guard.current()
  else close()
}

export function useCloseRequests() {
  useEffect(() => window.companion?.onCloseRequested(() => handleCloseRequest(() => void window.companion?.closeWindow())), [])
}

export const closeWindow = () => void window.companion?.closeWindow()
