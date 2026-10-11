export type BusinessProfileScenarioInput = {
  businessName: string
  serviceDescription: string
  ownerName: string
  street: string
  postalCode: string
  town: string
  phone: string
  mobile: string
  iban: string
  vatId: string
  taxNumber: string
}

export type BusinessProfileScenarioOverrides =
  Partial<BusinessProfileScenarioInput>

const defaultBusinessProfile: BusinessProfileScenarioInput = {
  businessName: 'Nordlicht Catering',
  serviceDescription: 'Party-Service',
  ownerName: 'Erika Beispiel',
  street: 'Hauptstraße 12',
  postalCode: '20095',
  town: 'Hamburg',
  phone: '040 123456',
  mobile: '',
  iban: 'DE89370400440532013000',
  vatId: 'DE123456789',
  taxNumber: '',
}

export function createBusinessProfileScenario(
  overrides: BusinessProfileScenarioOverrides = {},
): BusinessProfileScenarioInput {
  return {
    businessName: overrides.businessName ?? defaultBusinessProfile.businessName,
    serviceDescription:
      overrides.serviceDescription ?? defaultBusinessProfile.serviceDescription,
    ownerName: overrides.ownerName ?? defaultBusinessProfile.ownerName,
    street: overrides.street ?? defaultBusinessProfile.street,
    postalCode: overrides.postalCode ?? defaultBusinessProfile.postalCode,
    town: overrides.town ?? defaultBusinessProfile.town,
    phone: overrides.phone ?? defaultBusinessProfile.phone,
    mobile: overrides.mobile ?? defaultBusinessProfile.mobile,
    iban: overrides.iban ?? defaultBusinessProfile.iban,
    vatId: overrides.vatId ?? defaultBusinessProfile.vatId,
    taxNumber: overrides.taxNumber ?? defaultBusinessProfile.taxNumber,
  }
}
