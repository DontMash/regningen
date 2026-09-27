import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useBusinessProfile } from '@/features/invoicing/business-profile-query'
import { businessProfileSchema } from '@/features/invoicing/business-profile'

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
      <main className="mx-auto max-w-3xl px-4 py-12" role="alert">
        Das Unternehmensprofil konnte nicht aus diesem Browser geladen werden.
        Rechnungen sind gesperrt.
      </main>
    )
  }

  return (
    <main
      aria-label="Hauptinhalt"
      className="min-h-[calc(100dvh-4rem)] px-4 py-12 text-center text-muted-foreground"
      aria-live="polite"
    >
      Unternehmensprofil wird lokal geladen …
    </main>
  )
}
