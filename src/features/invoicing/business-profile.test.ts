import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { businessValidation } from './validation-composition'
import { validationMessage } from './validation-feedback'

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

const validate = businessValidation.validateBusinessProfile

describe('business profile validation', () => {
  it('presents the same domain failure in the current language', () => {
    const result = validate({ ...completeProfile, businessName: '' })
    expect(result.valid).toBe(false)
    if (result.valid) return
    overwriteGetLocale(() => 'en')
    expect(validationMessage('profile', result.failures[0])).toBe(
      'Business name is required.',
    )
    overwriteGetLocale(() => 'de')
    expect(validationMessage('profile', result.failures[0])).toBe(
      'Unternehmensname fehlt.',
    )
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
    const result = validate({ ...completeProfile, [field]: value })
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(
      result.failures.map((failure) => ({
        path: failure.path,
        message: validationMessage('profile', failure),
      })),
    ).toEqual([{ path: [field], message }])
  })

  it('accepts a German VAT ID as the issuer tax identifier', () => {
    expect(validate(completeProfile).valid).toBe(true)
  })
  it('requires at least one VAT ID or tax number', () => {
    expect(validate({ ...completeProfile, vatId: '' }).valid).toBe(false)
  })
  it('rejects a VAT ID without the German prefix and nine digits', () => {
    expect(validate({ ...completeProfile, vatId: '12345678901' }).valid).toBe(
      false,
    )
  })
  it('normalizes the IBAN and VAT ID for PDF use', () => {
    const result = validate({
      ...completeProfile,
      iban: 'de89 3704 0044 0532 0130 00',
      vatId: 'de 123 456 789',
    })
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.iban).toBe('DE89370400440532013000')
      expect(result.data.vatId).toBe('DE123456789')
    }
  })
  it('accepts a tax number instead of a VAT ID and permits an international IBAN', () => {
    expect(
      validate({
        ...completeProfile,
        iban: 'GB82 WEST 1234 5698 7654 32',
        vatId: '',
        taxNumber: '12/345/67890',
      }).valid,
    ).toBe(true)
  })
  it('rejects an IBAN with an invalid checksum', () => {
    expect(
      validate({ ...completeProfile, iban: 'DE89370400440532013001' }).valid,
    ).toBe(false)
  })
  it('requires the business name, owner, postal address, and IBAN', () => {
    expect(
      validate({
        ...completeProfile,
        businessName: '',
        ownerName: '',
        street: '',
        postalCode: '',
        town: '',
        iban: '',
      }).valid,
    ).toBe(false)
  })
})
