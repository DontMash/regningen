import { Store } from '@tanstack/store'

export const businessProfileStorageStatus = new Store<{
  error: string | null
}>({ error: null })

export const BUSINESS_PROFILE_STORAGE_ERROR =
  'Das Unternehmensprofil konnte nicht lokal gespeichert oder gelesen werden. Rechnungen sind gesperrt.'

export function markBusinessProfileStorageFailure() {
  businessProfileStorageStatus.setState(() => ({
    error: BUSINESS_PROFILE_STORAGE_ERROR,
  }))
}

export function clearBusinessProfileStorageFailure() {
  businessProfileStorageStatus.setState(() => ({ error: null }))
}
