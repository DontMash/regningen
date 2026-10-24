import { z } from '@/lib/validation'
import { businessValidation } from './validation-composition'
import { ibanVerification } from './iban-service'
import { validationMessage } from './validation-feedback'
import type { BusinessProfileDraft } from './validation-contract'

export type {
  BusinessProfile,
  BusinessProfileDraft,
} from './validation-contract'

/** Structural backup decoding, deliberately independent of business readiness. */
export const businessProfileDraftSchema = z
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

export const emptyBusinessProfile: BusinessProfileDraft = {
  businessName: '',
  serviceDescription: '',
  ownerName: '',
  street: '',
  postalCode: '',
  town: '',
  phone: '',
  mobile: '',
  iban: '',
  vatId: '',
  taxNumber: '',
}

/** Temporary Zod compatibility adapter; remove after consumers migrate. */
export const businessProfileSchema = businessProfileDraftSchema
  .strip()
  .transform((input, context) => {
    const result = businessValidation.validateBusinessProfile(input)
    if (result.valid) return result.data
    for (const failure of result.failures)
      context.addIssue({
        code: 'custom',
        path: failure.path,
        message: validationMessage('profile', failure),
      })
    return z.NEVER
  })

export function isValidIban(value: string): boolean {
  return ibanVerification.isValid(value.replace(/\s+/g, '').toUpperCase())
}
