import { describe, expect, it } from 'vitest'
import { createBusinessProfileScenario } from './business-profile'
import { createInvoiceScenario } from './invoice'

describe('Business Profile scenarios', () => {
  it('returns deterministic complete defaults and accepts invalid user input', () => {
    expect(createBusinessProfileScenario()).toEqual(
      createBusinessProfileScenario(),
    )
    expect(
      createBusinessProfileScenario({ iban: 'invalid-iban', vatId: 'DE123' }),
    ).toMatchObject({ iban: 'invalid-iban', vatId: 'DE123' })
  })

  it('returns a fresh input object for each factory call', () => {
    const first = createBusinessProfileScenario()
    const second = createBusinessProfileScenario()

    expect(first).not.toBe(second)
    first.businessName = 'Changed in one test'
    expect(second.businessName).toBe('Nordlicht Catering')
  })
})

describe('Invoice scenarios', () => {
  it('returns deterministic complete defaults with independent expectations', () => {
    expect(createInvoiceScenario()).toEqual(createInvoiceScenario())
    expect(createInvoiceScenario().expected.totals).toEqual({
      net: '146,73 €',
      tax: '10,27 €',
      gross: '157,00 €',
    })
  })

  it('keeps invalid input representable and applies focused overrides', () => {
    const scenario = createInvoiceScenario({
      number: '',
      date: 'not-a-date',
      recipient: { name: '' },
      positions: [{ description: '', amount: 'not-an-amount' }],
      expected: { totals: { gross: 'known independently' } },
    })

    expect(scenario.input).toMatchObject({
      number: '',
      date: 'not-a-date',
      recipient: { name: '' },
      positions: [{ description: '', amount: 'not-an-amount' }],
    })
    expect(scenario.expected.totals.gross).toBe('known independently')
    expect(scenario.expected.totals.net).toBe('146,73 €')
  })

  it('returns independent nested input, positions, and artifact expectations', () => {
    const first = createInvoiceScenario()
    const second = createInvoiceScenario()

    expect(first).not.toBe(second)
    expect(first.input.recipient).not.toBe(second.input.recipient)
    expect(first.input.positions).not.toBe(second.input.positions)
    expect(first.input.positions[0]).not.toBe(second.input.positions[0])
    expect(first.expected).not.toBe(second.expected)
    expect(first.expected.totals).not.toBe(second.expected.totals)
    expect(first.expected.pdfText).not.toBe(second.expected.pdfText)

    first.input.recipient.name = 'Changed recipient'
    first.input.positions[0].description = 'Changed position'
    first.expected.totals.gross = 'Changed expectation'
    first.expected.pdfText[0] = 'Changed PDF text'

    expect(second.input.recipient.name).toBe('Max Mustermann')
    expect(second.input.positions[0].description).toBe('Catering')
    expect(second.expected.totals.gross).toBe('157,00 €')
    expect(second.expected.pdfText[0]).toBe('Nordlicht Catering')
  })

  it('copies nested caller overrides rather than retaining mutable references', () => {
    const overrides = {
      recipient: { name: 'Override recipient' },
      positions: [{ description: 'Override position', amount: '5,00' }],
      expected: {
        totals: { gross: '5,00 €' },
        pdfText: ['Override PDF text'],
      },
    }
    const scenario = createInvoiceScenario(overrides)

    overrides.recipient.name = 'Caller mutation'
    overrides.positions[0].description = 'Caller mutation'
    overrides.expected.totals.gross = 'Caller mutation'
    overrides.expected.pdfText[0] = 'Caller mutation'

    expect(scenario.input.recipient.name).toBe('Override recipient')
    expect(scenario.input.positions[0].description).toBe('Override position')
    expect(scenario.expected.totals.gross).toBe('5,00 €')
    expect(scenario.expected.pdfText).toEqual(['Override PDF text'])
  })
})
