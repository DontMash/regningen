import type { ReactNode } from 'react'
import { ReleaseNotesProvider } from './ReleaseNotesProvider'
import { openBrowserAcknowledgmentPersistence } from './browser-acknowledgment-persistence'

export function ReleaseNotesComposition({ children }: { children: ReactNode }) {
  return (
    <ReleaseNotesProvider persistence={openBrowserAcknowledgmentPersistence}>
      {children}
    </ReleaseNotesProvider>
  )
}
