/** Supported Invoice Draft lifecycle and feature composition.
 * Startup, reload coordination and application reset share this connection.
 */
import {
  initializeInvoiceDraftPersistence as initialize,
  clearInvoiceDraftForApplicationReset as clearForReset,
} from './invoice-draft-store'
import { openBrowserInvoiceDraftPersistence } from './invoice-draft-storage'

export {
  invoiceDraftPersistenceStore,
  waitForInvoiceDraftPersistence,
} from './invoice-draft-store'

export function initializeInvoiceDraftPersistence() {
  return initialize(openBrowserInvoiceDraftPersistence)
}

export async function clearInvoiceDraftForApplicationReset(generation: string) {
  await initializeInvoiceDraftPersistence()
  await clearForReset(generation)
}
