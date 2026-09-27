import { describe, expect, it } from 'vitest'
import { businessProfileSchema, isValidIban } from './business-profile'

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
