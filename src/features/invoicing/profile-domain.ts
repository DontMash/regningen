import type { BusinessValidation } from './validation-contract'
import type { ProfileOperations, ProfilePersistence } from './profile-contract'

export function createProfileOperations(
  validation: BusinessValidation,
  persistence: ProfilePersistence,
): ProfileOperations {
  return {
    fieldLimits: validation.profileFieldLimits,
    validate: validation.validateBusinessProfile,
    readiness(input, unavailable = false) {
      if (unavailable) return { ready: false, reason: 'unavailable' }
      if (!input) return { ready: false, reason: 'missing' }
      const result = validation.validateBusinessProfile(input)
      return result.valid
        ? { ready: true, profile: result.data }
        : { ready: false, reason: 'incomplete' }
    },
    async save(input, generation) {
      const result = validation.validateBusinessProfile(input)
      if (result.valid) await persistence.saveProfile(result.data, generation)
      return result
    },
    load: () => persistence.loadProfile(),
    delete: (generation) => persistence.deleteProfile(generation),
    export: () => persistence.exportProfile(),
  }
}
