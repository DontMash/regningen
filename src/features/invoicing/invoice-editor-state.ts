import type { Store } from '@tanstack/store'
import type {
  BusinessValidation,
  InvoiceDraft,
  InvoiceEditing,
  InvoiceLineDraft,
  ValidationFailure,
} from './validation-contract'
import { validationMessage } from './validation-feedback'

function fieldErrors(failures: ValidationFailure[]) {
  return Object.fromEntries(
    failures.map((failure) => [
      failure.path.join('.'),
      validationMessage('invoice', failure),
    ]),
  )
}

/** Uses the existing working stores; no synchronized value copy is created here. */
export function createInvoiceEditorState({
  invoice,
  unfinished,
  editing,
  validation,
  freshInvoice,
  clearPersisted,
}: {
  invoice: Store<InvoiceDraft>
  unfinished: Store<InvoiceLineDraft>
  editing: InvoiceEditing
  validation: BusinessValidation
  freshInvoice: () => InvoiceDraft
  clearPersisted: () => Promise<void>
}) {
  let exportGeneration = 0
  return {
    fieldLimits: validation.invoiceFieldLimits,
    vatRates: validation.vatRates,
    selectVatRate(value: string | undefined) {
      const rate = validation.vatRates.find(
        (option) => String(option) === value,
      )
      if (rate !== undefined)
        invoice.setState((current) => ({ ...current, rate }))
    },
    getExportGeneration: () => exportGeneration,
    applyFreshDate() {
      invoice.setState((current) => ({ ...current, date: freshInvoice().date }))
    },
    hasInvoiceData() {
      return editing.hasWorkingData(
        invoice.state,
        { description: '', amount: '' },
        invoice.state,
      )
    },
    requiresResetConfirmation() {
      return editing.hasWorkingData(
        invoice.state,
        unfinished.state,
        freshInvoice(),
      )
    },
    async reset() {
      // A confirmed new Invoice abandons snapshot exports, even if clearing fails.
      exportGeneration++
      await clearPersisted()
      invoice.setState(() => freshInvoice())
      unfinished.setState(() => ({ description: '', amount: '' }))
    },
    derive() {
      const outcome = validation.validateInvoice(invoice.state)
      return {
        errors: outcome.valid ? {} : fieldErrors(outcome.failures),
        valid: outcome.valid,
        recipientMissing:
          !outcome.valid &&
          outcome.failures.some(
            (failure) => failure.reason === 'recipient-required',
          ),
        totals: editing.previewTotals(invoice.state),
        canAddPosition: editing.canAddPosition(invoice.state.items),
        newPositionErrors: fieldErrors(
          editing.validatePosition(unfinished.state).map((failure) => ({
            ...failure,
            path: ['items', ...failure.path],
          })),
        ),
      }
    },
    addPosition() {
      const outcome = editing.addPosition(invoice.state.items, unfinished.state)
      if (outcome.valid) {
        invoice.setState((current) => ({ ...current, items: outcome.data }))
        unfinished.setState(() => ({ description: '', amount: '' }))
      }
      return outcome
    },
    removePosition(index: number) {
      invoice.setState((current) => ({
        ...current,
        items: editing.removePosition(current.items, index),
      }))
    },
    updatePosition(index: number, change: Partial<InvoiceLineDraft>) {
      invoice.setState((current) => ({
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...change } : item,
        ),
      }))
    },
    hasPositionData: editing.hasPositionData,
    amountInCents: editing.parseAmount,
    descriptionLimit: editing.descriptionLimit,
    errorsFor(value: InvoiceDraft) {
      const outcome = validation.validateInvoice(value)
      return outcome.valid ? {} : fieldErrors(outcome.failures)
    },
  }
}
