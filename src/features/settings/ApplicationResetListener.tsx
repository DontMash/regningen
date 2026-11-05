import { useEffect } from 'react'
import { localizeUrl } from '@/paraglide/runtime'
import { subscribeToApplicationReset } from './application-reset'
import { invalidateUnsavedProfileChanges } from '@/features/invoicing/profile-editing'

/** Re-enter setup with fresh providers after a successful local or remote reset. */
export default function ApplicationResetListener() {
  useEffect(
    () =>
      subscribeToApplicationReset(() => {
        invalidateUnsavedProfileChanges()
        window.location.assign(
          localizeUrl(new URL('/settings/profile', window.location.origin))
            .href,
        )
      }),
    [],
  )
  return null
}
