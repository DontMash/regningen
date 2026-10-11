import type { BusinessProfileDraft } from '@/features/invoicing/business-profile'
import { BUSINESS_PROFILE_STORAGE_KEY } from '@/features/invoicing/business-profile-repository'

export const completeBusinessProfile: BusinessProfileDraft = {
  businessName: 'Nordlicht Catering',
  serviceDescription: 'Party-Service',
  ownerName: 'Erika Beispiel',
  street: 'Hauptstraße 12',
  postalCode: '20095',
  town: 'Hamburg',
  phone: '040 123456',
  mobile: '',
  iban: 'DE89370400440532013000',
  vatId: 'DE123456789',
  taxNumber: '',
}

export function saveBusinessProfile(profile: BusinessProfileDraft) {
  window.localStorage.setItem(
    BUSINESS_PROFILE_STORAGE_KEY,
    JSON.stringify({
      format: 'regningen-business-profile',
      version: 1,
      profile,
    }),
  )
}
