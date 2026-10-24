import type {
  BusinessProfile,
  BusinessProfileDraft,
  ValidationOutcome,
} from './validation-contract'

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

/** Save validates before any persistence effect. Operational failures reject with their original context. */
export interface ProfileOperations {
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
