import { isValidIBAN } from 'ibantools'
import { z } from 'zod'

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
    businessName: z.string().trim().min(1, 'Unternehmensname fehlt.').max(70),
    serviceDescription: optionalText.max(70),
    ownerName: z
      .string()
      .trim()
      .min(1, 'Name der Inhaberin oder des Inhabers fehlt.')
      .max(70),
    street: z.string().trim().min(1, 'Straße und Hausnummer fehlen.').max(85),
    postalCode: z.string().trim().min(1, 'Postleitzahl fehlt.').max(20),
    town: z.string().trim().min(1, 'Ort fehlt.').max(50),
    phone: optionalText.max(40),
    mobile: optionalText.max(40),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, '').toUpperCase())
      .refine(isValidIban, 'Bitte eine gültige IBAN eingeben.'),
    vatId: normalizedIdentifier,
    taxNumber: optionalText.max(30),
  })
  .superRefine((profile, context) => {
    if (!profile.vatId && !profile.taxNumber) {
      context.addIssue({
        code: 'custom',
        path: ['vatId'],
        message: 'Umsatzsteuer-ID oder Steuernummer angeben.',
      })
    }

    if (profile.vatId && !/^DE\d{9}$/.test(profile.vatId)) {
      context.addIssue({
        code: 'custom',
        path: ['vatId'],
        message:
          'Eine deutsche Umsatzsteuer-ID beginnt mit DE und hat neun Ziffern.',
      })
    }
  })

export type BusinessProfile = z.infer<typeof businessProfileSchema>

export function isValidIban(value: string): boolean {
  return isValidIBAN(value.replace(/\s+/g, '').toUpperCase())
}
