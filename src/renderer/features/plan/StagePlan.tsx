import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Activity, Character, GearItem, GearSlot } from '../../../shared/domain'
import type { ItemSummary } from '../../../shared/gamedata'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog'
import { authoredGoals, stagePlanItem, type ObservedCopy, type StageResult } from '../../lib/plan-item'
import { errorMessage, notify } from '../../lib/notify'
import { slotNames } from '../../lib/slot-names'

export type StageRequest = {
  character: Character
  activity: Activity
  item?: ItemSummary
  exact?: GearItem
  preferredSlot?: GearSlot
  slots?: GearSlot[]
  copy?: ObservedCopy | null
}
type Options = { stay?: boolean }
type Pending = { request: StageRequest; options: Options; slot: GearSlot; current: GearItem; incoming: GearItem }

const activityNames: Record<Activity, string> = { mythicPlus: 'Mythic+', raiding: 'Raiding', pvp: 'PvP' }

/** Every handoff into a plan uses this one policy: update the local draft, ask before replacing, and never save on its own */
export function useStagePlan() {
  const navigate = useNavigate()
  const [pending, setPending] = useState<Pending | null>(null)
  const report = useCallback((request: StageRequest, options: Options, result: StageResult) => {
    const name = request.exact?.name ?? request.item?.name ?? 'Item'
    if (result.status === 'incompatible') { notify(`${name} doesn't match this character's class, specialization, or gear slot`); return }
    if (result.status === 'conflict') { setPending({ request, options, slot: result.slot, current: result.current, incoming: result.incoming }); return }
    // Added and replaced items are saved at once, and that toast already says so with Undo
    if (result.status === 'noop') notify(`${name} is already your target for ${slotNames[result.slot]}`)
    if (!options.stay) void navigate({ to: '/characters/$characterId/$section/$view', params: { characterId: request.character.id, section: 'gear', view: 'plan' }, search: {} })
  }, [navigate])
  const stage = useCallback(async (request: StageRequest, options: Options = {}) => {
    try { report(request, options, await stagePlanItem(request)) } catch (error) { notify(errorMessage(error)) }
  }, [report])
  const confirm = async () => {
    if (!pending) return
    const { request, options } = pending
    setPending(null)
    try { report(request, options, await stagePlanItem({ ...request, preferredSlot: pending.slot, replace: true })) } catch (error) { notify(errorMessage(error)) }
  }
  const cleared = pending ? authoredGoals(pending.current) : []
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace your {pending ? slotNames[pending.slot] : ''} target?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending && <>
              Your draft already targets <strong>{pending.current.name}</strong>. Replacing it with <strong>{pending.incoming.name}</strong> {cleared.length ? `clears its goals: ${cleared.join(' · ')}` : 'keeps no goals from the old target'}
              {' '}· Nothing is saved until you choose Save plan
            </>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep current</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirm()}>Replace target</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { stage, dialog }
}
