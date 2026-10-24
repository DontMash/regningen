import { Store } from '@tanstack/store'
import * as m from '@/paraglide/messages'

export const businessProfileStorageStatus = new Store<{
  error: string | null
  cause?: unknown
}>({ error: null })

export function markBusinessProfileStorageFailure(cause?: unknown) {
  businessProfileStorageStatus.setState(() => ({
    error: m.profile_storage_error(),
    cause,
  }))
}

export function clearBusinessProfileStorageFailure() {
  businessProfileStorageStatus.setState(() => ({ error: null }))
}
