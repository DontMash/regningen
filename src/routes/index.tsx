import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useBusinessProfile } from '@/features/invoicing/business-profile-query'
import { businessProfileSchema } from '@/features/invoicing/business-profile'
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

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const profileQuery = useBusinessProfile()
  const navigate = useNavigate()

  useEffect(() => {
    if (!profileQuery.isSuccess) return

    const complete =
      profileQuery.data !== null &&
      businessProfileSchema.safeParse(profileQuery.data).success

    void navigate({
      to: complete ? '/invoice' : '/business-profile',
      replace: true,
    })
  }, [navigate, profileQuery.data, profileQuery.isSuccess])

  if (profileQuery.isError) {
    return (
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnungen sind gesperrt</AlertDialogTitle>
            <AlertDialogDescription>
              Das Unternehmensprofil konnte nicht aus diesem Browser geladen
              werden. Prüfe die lokalen Speichereinstellungen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Schließen</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.reload()}>
              Erneut laden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <div
      className="paragraph min-h-[calc(100dvh-4rem)] px-4 py-12 text-center text-muted-foreground"
      aria-live="polite"
    >
      Unternehmensprofil wird lokal geladen …
    </div>
  )
}
