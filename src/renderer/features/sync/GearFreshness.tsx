import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { gearFreshness } from '../../../shared/freshness'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Button } from '../../components/ui/primitives'

/**
 * How current this character's gear is, shown under every character page's heading. Gear more than a week old gets a
 * notice with a Sync now button, since every gear tool compares against it
 */
export function GearFreshness({ character }: { character: Character }) {
  const client = useQueryClient()
  const freshness = gearFreshness(character)
  const sync = useMutation({ mutationFn: () => api.syncNow('manual'), onSuccess: () => void client.invalidateQueries(), onError: error => notify(errorMessage(error)) })
  if (freshness.state !== 'stale' && freshness.state !== 'unknown') return null
  return (
    <div className="gear-freshness" role="status" data-state={freshness.state}>
      <TriangleAlert size={14} aria-hidden="true" />
      <span>{freshness.state === 'unknown' ? 'This character\'s gear hasn\'t been seen yet' : `${freshness.text}`} · gear tools compare against it, so sync before trusting their results</span>
      <Button variant="quiet" disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw size={13} aria-hidden="true" className={sync.isPending ? 'spin' : undefined} />{sync.isPending ? 'Syncing…' : 'Sync now'}</Button>
    </div>
  )
}
