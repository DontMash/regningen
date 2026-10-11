export type InvoiceRecipientInput = {
  company: string
  name: string
  street: string
  postalCode: string
  town: string
}

export type InvoicePositionInput = {
  description: string
  amount: string
}

export type InvoiceScenarioInput = {
  number: string
  date: string
  subject: string
  recipient: InvoiceRecipientInput
  vatRate: 7 | 19
  positions: InvoicePositionInput[]
}

export type InvoiceScenarioExpected = {
  totals: {
    net: string
    tax: string
    gross: string
  }
  pdfText: string[]
}

export type InvoiceScenario = {
  input: InvoiceScenarioInput
  expected: InvoiceScenarioExpected
}

/** Recipient overrides are partial; a positions override replaces the full list. */
export type InvoiceScenarioOverrides = Partial<
  Omit<InvoiceScenarioInput, 'recipient' | 'positions'>
> & {
  recipient?: Partial<InvoiceRecipientInput>
  positions?: InvoicePositionInput[]
  expected?: {
    totals?: Partial<InvoiceScenarioExpected['totals']>
    /** Replaces the full expected PDF text list. */
    pdfText?: string[]
  }
}

const defaultInvoiceInput: InvoiceScenarioInput = {
  number: '2026-001',
  date: '2026-06-15',
  subject: 'Catering für die Firmenfeier',
  recipient: {
    company: '',
    name: 'Max Mustermann',
    street: 'Musterstraße 1',
    postalCode: '20095',
    town: 'Hamburg',
  },
  vatRate: 7,
  positions: [
    { description: 'Catering', amount: '107,00' },
    { description: 'Reinigung', amount: '50,00' },
  ],
}

const defaultInvoiceExpected: InvoiceScenarioExpected = {
  totals: {
    net: '146,73 €',
    tax: '10,27 €',
    gross: '157,00 €',
  },
  pdfText: [
    'Nordlicht Catering',
    'Party-Service',
    'Erika Beispiel',
    'Hauptstraße 12',
    '20095 Hamburg',
    'Tel.: 040 123456',
    'Max Mustermann',
    'Musterstraße 1',
    'Rechnungsnummer 2026-001',
    'Datum: 15.06.2026',
    'Betreff: Catering für die Firmenfeier',
    'Catering',
    '107,00 €',
    'Reinigung',
    '50,00 €',
    'Netto:',
    '146,73 €',
    '7 % MwSt.:',
    '10,27 €',
    'Brutto:',
    '157,00 €',
    'DE89370400440532013000',
    'DE123456789',
  ],
}

export function createInvoiceScenario(
  overrides: InvoiceScenarioOverrides = {},
): InvoiceScenario {
  const input: InvoiceScenarioInput = {
    number: overrides.number ?? defaultInvoiceInput.number,
    date: overrides.date ?? defaultInvoiceInput.date,
    subject: overrides.subject ?? defaultInvoiceInput.subject,
    vatRate: overrides.vatRate ?? defaultInvoiceInput.vatRate,
    recipient: {
      company:
        overrides.recipient?.company ?? defaultInvoiceInput.recipient.company,
      name: overrides.recipient?.name ?? defaultInvoiceInput.recipient.name,
      street:
        overrides.recipient?.street ?? defaultInvoiceInput.recipient.street,
      postalCode:
        overrides.recipient?.postalCode ??
        defaultInvoiceInput.recipient.postalCode,
      town: overrides.recipient?.town ?? defaultInvoiceInput.recipient.town,
    },
    positions: (overrides.positions ?? defaultInvoiceInput.positions).map(
      ({ description, amount }) => ({ description, amount }),
    ),
  }

  return {
    input,
    expected: {
      totals: {
        net:
          overrides.expected?.totals?.net ?? defaultInvoiceExpected.totals.net,
        tax:
          overrides.expected?.totals?.tax ?? defaultInvoiceExpected.totals.tax,
        gross:
          overrides.expected?.totals?.gross ??
          defaultInvoiceExpected.totals.gross,
      },
      pdfText: [
        ...(overrides.expected?.pdfText ?? defaultInvoiceExpected.pdfText),
      ],
    },
  }
}
