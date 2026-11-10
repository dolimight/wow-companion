import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../components/ui/toast'
import { api } from './client'
import type { SimulationJob } from '../../shared/simulation'

/** Jobs started from this window, with the toast that follows each one to the end */
type Tracked = { characterId: string; jobId: string; toastId: string; label: string }
const tracked = new Map<string, Tracked>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => { version++; for (const listener of listeners) listener() }

/** Starts a loading toast for a queued or running job; the watcher turns it into the outcome */
export function trackSimulation(job: SimulationJob) {
  const toastId = toast.add({ type: 'loading', title: 'Simulation running', description: job.label, timeout: 0 })
  tracked.set(job.id, { characterId: job.characterId, jobId: job.id, toastId, label: job.label })
  changed()
}

const done = (job: SimulationJob) => job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled'

/** Mounted once in the app shell, so a run keeps its toast up to date while the player is on any page */
export function useSimulationToasts(openJob: (characterId: string, jobId: string) => void) {
  const client = useQueryClient()
  const count = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => version)
  useEffect(() => {
    if (!tracked.size) return
    let stopped = false
    const check = async () => {
      for (const characterId of new Set([...tracked.values()].map(entry => entry.characterId))) {
        const workspace = await api.simulationWorkspace({ characterId }).catch(() => null)
        if (!workspace || stopped) continue
        client.setQueryData(['simulations', characterId], workspace)
        for (const entry of [...tracked.values()].filter(value => value.characterId === characterId)) {
          const job = workspace.jobs.find(value => value.id === entry.jobId)
          if (!job || !done(job)) continue
          tracked.delete(entry.jobId)
          const details = job.state === 'completed' && job.result ? { actionProps: { children: 'Details', onClick: () => openJob(characterId, job.id) } } : {}
          toast.update(entry.toastId, job.state === 'completed'
            ? { type: 'success', title: 'Simulation finished', description: entry.label, timeout: 8000, ...details }
            : job.state === 'cancelled'
              ? { type: 'info', title: 'Simulation cancelled', description: entry.label, timeout: 5000 }
              : { type: 'error', title: 'Simulation failed', description: (job.failure ?? entry.label).replace(/\.+$/, ''), timeout: 10000 })
        }
      }
      if (tracked.size === 0) changed()
    }
    const timer = setInterval(() => void check(), 1500)
    void check()
    return () => { stopped = true; clearInterval(timer) }
  }, [count, client, openJob])
}
