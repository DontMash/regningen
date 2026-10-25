import type {
  BusinessProfile,
  BusinessProfileDraft,
  BusinessValidation,
  ValidationOutcome,
} from './validation-contract'

/** Expected operational failures only. Arbitrary defects must retain their identity. */
export class ProfileFailure extends Error {
  constructor(
    public readonly reason:
      'storage' | 'representation' | 'reset' | 'missing' | 'backup',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProfileFailure'
  }
}

export function isProfileStorageFailure(
  error: unknown,
): error is ProfileFailure {
  return (
    error instanceof ProfileFailure &&
    (error.reason === 'storage' || error.reason === 'representation')
  )
}

/** Persistence accepts structurally supported working data; it does not assert business validity. */
export interface ProfilePersistence {
  loadProfile: () => Promise<BusinessProfileDraft | null>
  saveProfile: (
    profile: BusinessProfileDraft,
    generation?: string,
  ) => Promise<void>
  deleteProfile: (generation?: string) => Promise<void>
  exportProfile: () => Promise<string>
}

export type ProfileReadiness =
  | { ready: true; profile: BusinessProfile }
  | { ready: false; reason: 'missing' | 'incomplete' | 'unavailable' }

/** Save validates before any persistence effect. Expected operational failures reject with ProfileFailure and preserved cause; defects are not storage failures. */
export interface ProfileOperations {
  fieldLimits: BusinessValidation['profileFieldLimits']
  validate: (input: BusinessProfileDraft) => ValidationOutcome<BusinessProfile>
  readiness: (
    input: BusinessProfileDraft | null | undefined,
    unavailable?: boolean,
  ) => ProfileReadiness
  save: (
    input: BusinessProfileDraft,
    generation?: string,
  ) => Promise<ValidationOutcome<BusinessProfile>>
  load: () => Promise<BusinessProfileDraft | null>
  delete: (generation?: string) => Promise<void>
  export: () => Promise<string>
}
export interface ProfileBackup {
  read: (file: File) => Promise<BusinessProfileDraft>
  download: (contents: string) => void
}
