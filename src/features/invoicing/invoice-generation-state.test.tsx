// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocale, overwriteGetLocale } from '@/paraglide/runtime'
import { createBusinessProfileScenario } from '../../../tests/scenarios/business-profile'
import { createInvoiceScenario } from '../../../tests/scenarios/invoice'
import { createInvoiceGeneration } from './generation-domain'
import { businessValidation } from './validation-composition'
import { InvoicePdfFailure } from './generation-contract'
import {
  pdfFailureMessage,
  useInvoiceGeneration,
} from './invoice-generation-state'

const originalLocale = getLocale
// Hook tests observe the UI-facing operation; real PDF content has separate
// domain-operation and production-browser evidence.
afterEach(() => {
  cleanup()
  overwriteGetLocale(originalLocale)
})
function draft() {
  const { input } = createInvoiceScenario()
  return {
    ...input,
    ...input.recipient,
    rate: input.vatRate,
    items: input.positions,
  }
}

describe('UI-facing Invoice generation', () => {
  it('reports invalid input without downloading or discarding the failure details', async () => {
    const generation = createInvoiceGeneration(businessValidation, {
      render: async () => new Uint8Array([1]),
    })
    const download = vi.fn()
    const { result } = renderHook(() =>
      useInvoiceGeneration(generation, download),
    )
    await act(async () => {
      expect(
        await result.current.generate(
          createBusinessProfileScenario(),
          { ...draft(), items: [] },
          'de',
        ),
      ).toBe(false)
    })
    expect(download).not.toHaveBeenCalled()
    expect(result.current.failure).toMatchObject({
      status: 'invalid',
      invoiceFailures: [{ reason: 'position-required' }],
    })
    expect(result.current.isGenerating).toBe(false)
  })

  it('preserves format failure context and reports no successful download', async () => {
    const failure = new InvoicePdfFailure('characters', {
      cause: new Error('encoder'),
    })
    const generation = createInvoiceGeneration(businessValidation, {
      render: async () => {
        throw failure
      },
    })
    const download = vi.fn()
    const { result } = renderHook(() =>
      useInvoiceGeneration(generation, download),
    )
    await act(async () => {
      expect(
        await result.current.generate(
          createBusinessProfileScenario(),
          draft(),
          'en',
        ),
      ).toBe(false)
    })
    expect(download).not.toHaveBeenCalled()
    expect(result.current.failure).toBe(failure)
    expect(result.current.isGenerating).toBe(false)
  })

  it.each([
    ['business-name', 'Der Unternehmensname ist zu lang für das PDF.'],
    ['service', 'Die Leistungsbeschreibung ist zu lang für das PDF.'],
    ['addresses', 'Die Anschriften sind zu umfangreich für eine Seite.'],
    ['subject', 'Der Betreff ist zu lang für eine Seite.'],
    ['description', 'Eine Positionsbeschreibung ist zu lang für eine Seite.'],
    [
      'positions',
      'Zu viele lange Positionen für eine Seite. Bitte Beschreibungen kürzen.',
    ],
    ['invoice', 'Die Rechnungsdaten sind zu umfangreich für eine Seite.'],
  ] as const)(
    'provides meaningful feedback for the %s format failure',
    (reason, expected) => {
      overwriteGetLocale(() => 'de')
      expect(pdfFailureMessage(new InvoicePdfFailure(reason))).toBe(expected)
    },
  )

  it.each([
    {
      locale: 'de',
      unavailable:
        'PDF-Erstellung oder Download ist in diesem Browser nicht verfügbar.',
      format: 'Bitte Sonderzeichen in den Angaben prüfen.',
    },
    {
      locale: 'en',
      unavailable: 'PDF generation or download is unavailable in this browser.',
      format: 'Please check special characters in the details.',
    },
  ] as const)(
    'localizes capability feedback in $locale independently of Invoice Language',
    ({ locale, unavailable, format }) => {
      overwriteGetLocale(() => locale)
      expect(pdfFailureMessage(new InvoicePdfFailure('unavailable'))).toBe(
        unavailable,
      )
      expect(pdfFailureMessage(new InvoicePdfFailure('characters'))).toContain(
        format,
      )
      expect(pdfFailureMessage(new TypeError('defect'))).not.toBe('defect')
    },
  )
})
