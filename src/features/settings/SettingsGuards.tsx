import { useRef } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  confirmDiscardProfileChanges,
  hasUnsavedProfileChanges,
  resolveProfileDiscardConfirmation,
  unsavedProfileStore,
} from './unsaved-profile'

export default function SettingsGuards() {
  const confirmationOpener = useRef<HTMLElement | null>(null)
  const confirming = useSelector(
    unsavedProfileStore,
    (state) => state.confirming,
  )
  useBlocker({
    shouldBlockFn: async ({ current, next }) =>
      current.pathname !== next.pathname &&
      !(await confirmDiscardProfileChanges()),
    enableBeforeUnload: () => hasUnsavedProfileChanges(),
  })

  return (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => {
        if (!open) resolveProfileDiscardConfirmation(false)
      }}
      onOpenChangeComplete={(open) => {
        // Compact navigation removes its opener before this confirmation closes.
        if (!open && !confirmationOpener.current?.isConnected) {
          document.getElementById('hauptinhalt')?.focus({ preventScroll: true })
        }
      }}
    >
      <AlertDialogContent
        initialFocus={() => {
          confirmationOpener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
          return true
        }}
        finalFocus={() =>
          confirmationOpener.current?.isConnected
            ? confirmationOpener.current
            : false
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Ungespeicherte Änderungen verwerfen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deine Änderungen am Unternehmensprofil wurden noch nicht
            gespeichert. Wenn du fortfährst, gehen diese Änderungen verloren.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Bleiben</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => resolveProfileDiscardConfirmation(true)}
          >
            Änderungen verwerfen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
