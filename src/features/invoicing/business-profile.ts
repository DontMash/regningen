import { isValidIBAN } from 'ibantools'
import { z } from '@/lib/validation'
import * as m from '@/paraglide/messages'

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

export type BusinessProfileDraft = z.infer<typeof businessProfileDraftSchema>

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

const optionalText = z.string().trim()
const normalizedIdentifier = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, '').toUpperCase())

export const businessProfileSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(1, { error: () => m.profile_business_name_required() })
      .max(70),
    serviceDescription: optionalText.max(70),
    ownerName: z
      .string()
      .trim()
      .min(1, { error: () => m.profile_owner_name_required() })
      .max(70),
    street: z
      .string()
      .trim()
      .min(1, { error: () => m.profile_street_required() })
      .max(85),
    postalCode: z
      .string()
      .trim()
      .min(1, { error: () => m.profile_postal_code_required() })
      .max(20),
    town: z
      .string()
      .trim()
      .min(1, { error: () => m.profile_town_required() })
      .max(50),
    phone: optionalText.max(40),
    mobile: optionalText.max(40),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, '').toUpperCase())
      .refine(isValidIban, { error: () => m.profile_iban_invalid() }),
    vatId: normalizedIdentifier,
    taxNumber: optionalText.max(30),
  })
  .superRefine((profile, context) => {
    if (!profile.vatId && !profile.taxNumber) {
      context.addIssue({
        code: 'custom',
        path: ['vatId'],
        message: m.profile_tax_identifier_required(),
      })
    }

    if (profile.vatId && !/^DE\d{9}$/.test(profile.vatId)) {
      context.addIssue({
        code: 'custom',
        path: ['vatId'],
        message: m.profile_vat_id_invalid(),
      })
    }
  })

export type BusinessProfile = z.infer<typeof businessProfileSchema>

export function isValidIban(value: string): boolean {
  return isValidIBAN(value.replace(/\s+/g, '').toUpperCase())
}
