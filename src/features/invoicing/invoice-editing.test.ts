import { describe, expect, it } from 'vitest'
import { invoiceEditingDomain } from './validation-domain'
import { createInvoiceEditorState } from './invoice-editor-state'
import { businessValidation } from './validation-composition'
import { Store } from '@tanstack/store'
import { createEmptyInvoiceDraft } from './invoice-draft-store'
import type { InvoiceLineDraft } from './validation-contract'

const position = {
  description: 'Consulting',
  amount: '119,00',
  amountLocale: 'de' as const,
}

describe('Invoice Position editing decisions', () => {
  it('keeps incomplete working data out of completed charges until explicitly added', () => {
    expect(
      invoiceEditingDomain.addPosition([], { description: 'Work', amount: '' })
        .valid,
    ).toBe(false)
    expect(invoiceEditingDomain.addPosition([], position)).toEqual({
      valid: true,
      data: [position],
    })
  })

  it.each([
    { rate: 7 as const, expected: { gross: 123401, net: 115328, tax: 8073 } },
    { rate: 19 as const, expected: { gross: 123401, net: 103698, tax: 19703 } },
  ])(
    'previews added charges with cent rounding at $rate percent using each entry language',
    ({ rate, expected }) => {
      const draft = {
        ...createEmptyInvoiceDraft(),
        rate,
        items: [
          {
            description: 'English thousands',
            amount: '1,234',
            amountLocale: 'en' as const,
          },
          {
            description: 'German cent',
            amount: '0,01',
            amountLocale: 'de' as const,
          },
        ],
      }
      expect(invoiceEditingDomain.previewTotals(draft)).toEqual(expected)
      expect(
        invoiceEditingDomain.previewTotals({
          ...draft,
          items: [...draft.items, { description: '', amount: '' }],
        }),
      ).toEqual(expected)
      for (const invalid of [
        { description: 'Work', amount: '0' },
        { description: 'Work', amount: '-1' },
        { description: '', amount: '10' },
        { description: 'Work', amount: '1.' },
        { description: 'x'.repeat(86), amount: '10' },
      ]) {
        expect(invoiceEditingDomain.addPosition([], invalid).valid).toBe(false)
        expect(
          invoiceEditingDomain.previewTotals({ ...draft, items: [invalid] }),
        ).toBeNull()
      }
    },
  )

  it('applies the description limit even to otherwise blank working rows', () => {
    const outcome = businessValidation.validateInvoice({
      ...createEmptyInvoiceDraft(),
      items: [{ description: ' '.repeat(86), amount: '' }],
    })
    expect(outcome.valid).toBe(false)
    if (!outcome.valid)
      expect(outcome.failures).toContainEqual({
        path: ['items', 0, 'description'],
        reason: 'too-long',
        limit: 85,
      })
  })

  it('preserves a rejected position and frees capacity after removing a completed charge', () => {
    const invoice = new Store({
      ...createEmptyInvoiceDraft(),
      items: Array.from({ length: 16 }, () => ({ ...position })),
    })
    const unfinished = new Store<InvoiceLineDraft>({
      ...position,
      amount: '7,00',
    })
    const editor = createInvoiceEditorState({
      invoice,
      unfinished,
      editing: invoiceEditingDomain,
      validation: businessValidation,
    })
    expect(editor.derive().canAddPosition).toBe(false)
    expect(editor.addPosition().valid).toBe(false)
    expect(unfinished.state.amount).toBe('7,00')
    editor.removePosition(0)
    expect(editor.derive().canAddPosition).toBe(true)
    expect(editor.addPosition().valid).toBe(true)
    expect(invoice.state.items).toHaveLength(16)
    expect(unfinished.state).toEqual({ description: '', amount: '' })
    expect(editor.derive().totals).toEqual({
      gross: 179200,
      net: 167477,
      tax: 11723,
    })
  })
})
