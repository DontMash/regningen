import { useEffect } from 'react'
import { subscribeToApplicationReset } from './application-reset'
import { invalidateUnsavedProfileChanges } from './unsaved-profile'

/** Re-enter setup with fresh providers after a successful local or remote reset. */
export default function ApplicationResetListener() {
  useEffect(
    () =>
      subscribeToApplicationReset(() => {
        invalidateUnsavedProfileChanges()
        window.location.assign('/settings/profile')
      }),
    [],
  )
  return null
}
