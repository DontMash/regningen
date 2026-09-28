import { z } from 'zod'
import { businessProfileDraftSchema } from './business-profile'
import type { BusinessProfileDraft } from './business-profile'

export const BUSINESS_PROFILE_STORAGE_KEY = 'regningen.business-profile'
const BACKUP_FORMAT = 'regningen-business-profile'
const BACKUP_VERSION = 1

export class InvalidBusinessProfileBackupError extends Error {}

export type BusinessProfileStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    profile: businessProfileDraftSchema,
  })
  .strict()

function createBackup(profile: BusinessProfileDraft) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    profile,
  } as const
}

function readBackup(text: string) {
  let decoded: unknown

  try {
    decoded = JSON.parse(text)
  } catch {
    throw new InvalidBusinessProfileBackupError(
      'Die Profilsicherung enthält kein gültiges JSON.',
    )
  }

  const result = backupSchema.safeParse(decoded)
  if (!result.success) {
    throw new InvalidBusinessProfileBackupError(
      'Die Profilsicherung hat ein ungültiges Format.',
    )
  }

  return result.data
}

export function createBusinessProfileRepository(
  storage: BusinessProfileStorage,
) {
  return {
    async loadProfile(): Promise<BusinessProfileDraft | null> {
      const text = storage.getItem(BUSINESS_PROFILE_STORAGE_KEY)
      if (text === null) return null

      return readBackup(text).profile
    },

    async saveProfile(profile: BusinessProfileDraft): Promise<void> {
      const normalized = businessProfileDraftSchema.parse(profile)
      storage.setItem(
        BUSINESS_PROFILE_STORAGE_KEY,
        JSON.stringify(createBackup(normalized)),
      )
    },

    async exportProfile(): Promise<string> {
      const text = storage.getItem(BUSINESS_PROFILE_STORAGE_KEY)
      if (text === null) {
        throw new Error('Es gibt noch kein Unternehmensprofil zum Exportieren.')
      }

      return JSON.stringify(createBackup(readBackup(text).profile), null, 2)
    },

    async importProfile(text: string): Promise<BusinessProfileDraft> {
      const backup = readBackup(text)
      storage.setItem(BUSINESS_PROFILE_STORAGE_KEY, JSON.stringify(backup))
      return backup.profile
    },

    async deleteProfile(): Promise<void> {
      storage.removeItem(BUSINESS_PROFILE_STORAGE_KEY)
    },
  }
}

export function createBrowserBusinessProfileRepository() {
  if (typeof window === 'undefined') {
    throw new Error('Unternehmensprofile sind nur im Browser verfügbar.')
  }

  return createBusinessProfileRepository(window.localStorage)
}
