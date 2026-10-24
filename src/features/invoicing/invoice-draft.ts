/** Supported Invoice Draft lifecycle and feature composition.
 * Startup, reload coordination and application reset share this connection.
 */
import {
  initializeInvoiceDraftPersistence as initialize,
  clearInvoiceDraftForApplicationReset as clearForReset,
} from './invoice-draft-store'
import {
  createInvoiceDraftPersistence,
  openBrowserInvoiceDraftPersistence,
} from './invoice-draft-storage'
import type { InvoiceDraftStorage } from './invoice-draft-storage'

export {
  invoiceDraftPersistenceStore,
  waitForInvoiceDraftPersistence,
} from './invoice-draft-store'

/** The optional raw driver adapter supports existing alternate-storage callers. */
export function initializeInvoiceDraftPersistence(
  storage?: InvoiceDraftStorage,
) {
  return initialize(
    storage
      ? () => createInvoiceDraftPersistence(storage)
      : openBrowserInvoiceDraftPersistence,
  )
}

export async function clearInvoiceDraftForApplicationReset(generation: string) {
  await initializeInvoiceDraftPersistence()
  await clearForReset(generation)
}
