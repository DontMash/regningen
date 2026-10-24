import { z } from '@/lib/validation'
import * as m from '@/paraglide/messages'
import type { BusinessProfileDraft } from './validation-contract'
import {
  getApplicationResetGeneration,
  INITIAL_APPLICATION_RESET_GENERATION,
} from '@/lib/application-reset-generation'

export const BUSINESS_PROFILE_STORAGE_KEY = 'regningen.business-profile'
const BACKUP_FORMAT = 'regningen-business-profile'
const BACKUP_VERSION = 1

export class InvalidBusinessProfileBackupError extends Error {}

export type BusinessProfileStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

/** Structural decoding accepts incomplete editable profiles, not business validity. */
const businessProfileDraftSchema = z
  .object({
    businessName: z.string(),
    serviceDescription: z.string(),
    ownerName: z.string(),
    street: z.string(),
    postalCode: z.string(),
    town: z.string(),
    phone: z.string(),
    mobile: z.string(),
    iban: z.string(),
    vatId: z.string(),
    taxNumber: z.string(),
  })
  .strict()

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
  } catch (cause) {
    throw new InvalidBusinessProfileBackupError(
      m.profile_backup_invalid_json(),
      { cause },
    )
  }

  const result = (stored ? storedProfileSchema : backupSchema).safeParse(
    decoded,
  )
  if (!result.success) {
    throw new InvalidBusinessProfileBackupError(
      m.profile_backup_invalid_format(),
      { cause: result.error },
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
        throw new Error(m.profile_reset_before_save())
      storage.setItem(
        BUSINESS_PROFILE_STORAGE_KEY,
        JSON.stringify({
          ...createBackup(normalized),
          resetGeneration: generation,
        }),
      )
      if (generation !== getGeneration())
        throw new Error(m.profile_reset_during_save())
    },

    async exportProfile(): Promise<string> {
      const profile = loadProfile()
      if (profile === null) {
        throw new Error(m.profile_backup_missing())
      }
      return JSON.stringify(createBackup(profile), null, 2)
    },

    async deleteProfile(generation = getGeneration()): Promise<void> {
      if (generation !== getGeneration())
        throw new Error(m.profile_reset_before_delete())
      storage.removeItem(BUSINESS_PROFILE_STORAGE_KEY)
    },
  }
}

export function createBrowserBusinessProfileRepository() {
  if (typeof window === 'undefined') {
    throw new Error(m.profile_browser_only())
  }

  return createBusinessProfileRepository(window.localStorage)
}
