import type { ReactNode } from 'react'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Button } from './ui/button'

/** Asks before leaving unsaved work; the router blocker stays pending until one of the three choices is made */
export function LeaveGuard({ open, title, description, saving = false, onKeep, onSave, onDiscard, discardLabel = 'Leave without saving' }: {
  open: boolean
  title: string
  description: ReactNode
  saving?: boolean
  onKeep: () => void
  onSave?: () => void
  onDiscard: () => void
  discardLabel?: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={next => { if (!next) onKeep() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard}>{discardLabel}</Button>
          {onSave && <Button disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save and leave'}</Button>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
