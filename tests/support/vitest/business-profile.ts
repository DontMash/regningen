import { createBusinessProfileScenario } from '../../scenarios/business-profile'
import type { BusinessProfileScenarioInput } from '../../scenarios/business-profile'
import { BUSINESS_PROFILE_STORAGE_KEY } from '@/features/invoicing/business-profile-repository'

// Compatibility for suites not yet migrated to fresh scenario factories.
export const completeBusinessProfile = createBusinessProfileScenario()

export function saveBusinessProfile(profile: BusinessProfileScenarioInput) {
  window.localStorage.setItem(
    BUSINESS_PROFILE_STORAGE_KEY,
    JSON.stringify({
      format: 'regningen-business-profile',
      version: 1,
      profile,
    }),
  )
}
