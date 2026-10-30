import { useEffect, useId } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { gearMemory } from './plan-item'

const reasons = new Map<string, string>()
const listeners = new Set<() => void>()

export function setLocalUpdateBlocker(id: string, reason: string | null) {
  if (reason) reasons.set(id, reason)
  else reasons.delete(id)
  for (const listener of listeners) listener()
}

export function collectUpdateBlockers() {
  const result = new Set(reasons.values())
  if ([...gearMemory.values()].some(plan => plan.dirty)) result.add('Save your gear plans before restarting')
  return [...result]
}

export async function syncUpdateBlockers() {
  await window.companion?.setUpdateBlockers(collectUpdateBlockers())
}

export function useUpdateBlocker(active: boolean, reason: string) {
  const id = useId()
  useEffect(() => {
    setLocalUpdateBlocker(id, active ? reason : null)
    return () => setLocalUpdateBlocker(id, null)
  }, [id, active, reason])
}

/** Keep the trusted main process aware even when the update UI isn't open */
export function useUpdateSafety() {
  const mutations = useIsMutating()
  useUpdateBlocker(mutations > 0, 'Wait for changes to finish saving')
  useEffect(() => {
    const sync = () => { void syncUpdateBlockers().catch(() => undefined) }
    listeners.add(sync)
    const timer = setInterval(sync, 2000)
    sync()
    return () => { listeners.delete(sync); clearInterval(timer) }
  }, [])
}
