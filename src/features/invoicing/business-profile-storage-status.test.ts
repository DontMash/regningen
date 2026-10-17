import { afterEach, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import {
  businessProfileStorageStatus,
  clearBusinessProfileStorageFailure,
  markBusinessProfileStorageFailure,
} from './business-profile-storage-status'

const originalGetLocale = getLocale

afterEach(() => {
  clearBusinessProfileStorageFailure()
  overwriteGetLocale(originalGetLocale)
})

it('reports storage failures in the active language and clears them after recovery', () => {
  overwriteGetLocale(() => 'en')
  markBusinessProfileStorageFailure()
  expect(businessProfileStorageStatus.state.error).toBe(
    'The Business Profile could not be saved or read locally. Invoicing is blocked.',
  )

  clearBusinessProfileStorageFailure()
  expect(businessProfileStorageStatus.state.error).toBeNull()

  overwriteGetLocale(() => 'de')
  markBusinessProfileStorageFailure()
  expect(businessProfileStorageStatus.state.error).toBe(
    'Das Unternehmensprofil konnte nicht lokal gespeichert oder gelesen werden. Rechnungen sind gesperrt.',
  )
})
