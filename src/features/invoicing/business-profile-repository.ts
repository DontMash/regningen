import { z } from 'zod'
import { businessProfileDraftSchema } from './business-profile'
import type { BusinessProfileDraft } from './business-profile'
import {
  getApplicationResetGeneration,
  INITIAL_APPLICATION_RESET_GENERATION,
} from '../settings/reset-generation'

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

const storedProfileSchema = backupSchema.extend({
  resetGeneration: z.string().optional(),
})

function createBackup(profile: BusinessProfileDraft) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    profile,
  } as const
}

function readBackup(text: string, stored = false) {
  let decoded: unknown

  try {
    decoded = JSON.parse(text)
  } catch {
    throw new InvalidBusinessProfileBackupError(
      'Die Profilsicherung enthält kein gültiges JSON.',
    )
  }

  const result = (stored ? storedProfileSchema : backupSchema).safeParse(
    decoded,
  )
  if (!result.success) {
    throw new InvalidBusinessProfileBackupError(
      'Die Profilsicherung hat ein ungültiges Format.',
    )
  }

  return result.data
}

export function parseBusinessProfileBackup(text: string): BusinessProfileDraft {
  return readBackup(text).profile
}

export function createBusinessProfileRepository(
  storage: BusinessProfileStorage,
  getGeneration: () => string = getApplicationResetGeneration,
) {
  function loadProfile(): BusinessProfileDraft | null {
    const text = storage.getItem(BUSINESS_PROFILE_STORAGE_KEY)
    if (text === null) return null
    const envelope = readBackup(text, true)
    const generation =
      ('resetGeneration' in envelope ? envelope.resetGeneration : undefined) ??
      INITIAL_APPLICATION_RESET_GENERATION
    return generation === getGeneration() ? envelope.profile : null
  }

  return {
    async loadProfile(): Promise<BusinessProfileDraft | null> {
      return loadProfile()
    },

    async saveProfile(
      profile: BusinessProfileDraft,
      generation = getGeneration(),
    ): Promise<void> {
      const normalized = businessProfileDraftSchema.parse(profile)
      if (generation !== getGeneration())
        throw new Error(
          'Die Anwendung wurde zurückgesetzt. Lade die Seite neu, bevor du das Profil speicherst.',
        )
      storage.setItem(
        BUSINESS_PROFILE_STORAGE_KEY,
        JSON.stringify({
          ...createBackup(normalized),
          resetGeneration: generation,
        }),
      )
      if (generation !== getGeneration())
        throw new Error(
          'Die Anwendung wurde während des Speicherns zurückgesetzt.',
        )
    },

    async exportProfile(): Promise<string> {
      const profile = loadProfile()
      if (profile === null) {
        throw new Error('Es gibt noch kein Unternehmensprofil zum Exportieren.')
      }
      return JSON.stringify(createBackup(profile), null, 2)
    },

    async deleteProfile(generation = getGeneration()): Promise<void> {
      if (generation !== getGeneration())
        throw new Error(
          'Die Anwendung wurde zurückgesetzt. Lade die Seite neu, bevor du das Profil löschst.',
        )
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
