import { Store } from '@tanstack/store'
import * as m from '@/paraglide/messages'

export const businessProfileStorageStatus = new Store<{
  error: string | null
}>({ error: null })

export function markBusinessProfileStorageFailure() {
  businessProfileStorageStatus.setState(() => ({
    error: m.profile_storage_error(),
  }))
}

export function clearBusinessProfileStorageFailure() {
  businessProfileStorageStatus.setState(() => ({ error: null }))
}
