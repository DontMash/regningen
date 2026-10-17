import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { businessProfileSchema, isValidIban } from './business-profile'

const originalGetLocale = getLocale
afterEach(() => overwriteGetLocale(originalGetLocale))

const completeProfile = {
  businessName: 'Beispielbetrieb',
  serviceDescription: '',
  ownerName: 'Erika Beispiel',
  street: 'Beispielstraße 1',
  postalCode: '12345',
  town: 'Beispielstadt',
  phone: '',
  mobile: '',
  iban: 'DE89370400440532013000',
  vatId: 'DE123456789',
  taxNumber: '',
}

describe('business profile validation', () => {
  it('validates the business name in the active language without recreating the schema', () => {
    overwriteGetLocale(() => 'en')
    const english = businessProfileSchema.safeParse({
      ...completeProfile,
      businessName: '',
    })
    expect(english.error?.issues[0]?.message).toBe('Business name is required.')

    overwriteGetLocale(() => 'de')
    const german = businessProfileSchema.safeParse({
      ...completeProfile,
      businessName: '',
    })
    expect(german.error?.issues[0]?.message).toBe('Unternehmensname fehlt.')
  })

  it.each([
    ['ownerName', '', 'Owner name is required.'],
    ['street', '', 'Street and house number are required.'],
    ['postalCode', '', 'Postal code is required.'],
    ['town', '', 'Town or city is required.'],
    ['iban', 'invalid', 'Please enter a valid IBAN.'],
    ['vatId', '', 'Provide a VAT ID or tax number.'],
    [
      'vatId',
      'DE123',
      'A German VAT ID starts with DE followed by nine digits.',
    ],
  ])('explains invalid %s in English', (field, value, message) => {
    overwriteGetLocale(() => 'en')
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      [field]: value,
    })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: [field], message }),
    ])
  })

  it('accepts a German VAT ID as the issuer tax identifier', () => {
    expect(businessProfileSchema.safeParse(completeProfile).success).toBe(true)
  })

  it('requires at least one VAT ID or tax number', () => {
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      vatId: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a VAT ID without the German prefix and nine digits', () => {
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      vatId: '12345678901',
    })

    expect(result.success).toBe(false)
  })

  it('normalizes the IBAN and VAT ID for PDF use', () => {
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      iban: 'de89 3704 0044 0532 0130 00',
      vatId: 'de 123 456 789',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.iban).toBe('DE89370400440532013000')
      expect(result.data.vatId).toBe('DE123456789')
    }
  })

  it('accepts a tax number instead of a VAT ID and permits an international IBAN', () => {
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      iban: 'GB82 WEST 1234 5698 7654 32',
      vatId: '',
      taxNumber: '12/345/67890',
    })

    expect(result.success).toBe(true)
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true)
  })

  it('rejects an IBAN with an invalid checksum', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false)
  })

  it('requires the business name, owner, postal address, and IBAN', () => {
    const result = businessProfileSchema.safeParse({
      ...completeProfile,
      businessName: '',
      ownerName: '',
      street: '',
      postalCode: '',
      town: '',
      iban: '',
    })

    expect(result.success).toBe(false)
  })
})
