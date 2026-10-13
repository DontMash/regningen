import { Store } from '@tanstack/store'
import { createStorage } from 'unstorage'
import sessionStorageDriver from 'unstorage/drivers/session-storage'
import type { InvoiceDraft, InvoiceLineDraft } from './invoice'
import { z } from 'zod'

export type { InvoiceDraft, InvoiceLineDraft } from './invoice'

export const INVOICE_DRAFT_STORAGE_KEY = 'regningen.invoice-draft'
const INVOICE_DRAFT_SCHEMA_VERSION = 1

const invoiceLineDraftSchema = z
  .object({ description: z.string(), amount: z.string() })
  .strict()
const invoiceDraftSchema = z
  .object({
    number: z.string(),
    date: z.string(),
    subject: z.string(),
    company: z.string(),
    name: z.string(),
    street: z.string(),
    postalCode: z.string(),
    town: z.string(),
    rate: z.union([z.literal(7), z.literal(19)]),
    items: z.array(invoiceLineDraftSchema),
  })
  .strict()
const invoiceDraftEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(INVOICE_DRAFT_SCHEMA_VERSION),
    invoice: invoiceDraftSchema,
    newPosition: invoiceLineDraftSchema,
  })
  .strict()

export interface InvoiceDraftEnvelope {
  schemaVersion: typeof INVOICE_DRAFT_SCHEMA_VERSION
  invoice: InvoiceDraft
  newPosition: InvoiceLineDraft
}

export interface InvoiceDraftStorage {
  getItem: (key: string) => Promise<unknown | null>
  setItem: (key: string, value: unknown) => Promise<void>
  removeItem: (key: string) => Promise<void>
  dispose?: () => Promise<void>
}

export interface InvoiceDraftPersistenceState {
  initialized: boolean
  restored: boolean
  saved: boolean
  pending: boolean
  error: string | null
}

export function createEmptyInvoiceDraft(): InvoiceDraft {
  return {
    number: '',
    date: '',
    subject: '',
    company: '',
    name: '',
    street: '',
    postalCode: '',
    town: '',
    rate: 7,
    items: [],
  }
}

export const invoiceDraftStore = new Store<InvoiceDraft>(
  createEmptyInvoiceDraft(),
)

export const invoicePositionDraftStore = new Store<InvoiceLineDraft>({
  description: '',
  amount: '',
})

export const invoiceDraftPersistenceStore =
  new Store<InvoiceDraftPersistenceState>({
    initialized: false,
    restored: false,
    saved: true,
    pending: false,
    error: null,
  })

let storage: InvoiceDraftStorage | null = null
let ownsStorage = false
let initialization: Promise<void> | null = null
let invoiceSubscription: { unsubscribe: () => void } | null = null
let positionSubscription: { unsubscribe: () => void } | null = null
let writes: Promise<void> = Promise.resolve()
let revision = 0
let beforeUnloadAttached = false

function setPersistenceState(next: Partial<InvoiceDraftPersistenceState>) {
  invoiceDraftPersistenceStore.setState((current) => ({ ...current, ...next }))
  syncBeforeUnloadWarning()
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

function syncBeforeUnloadWarning() {
  if (typeof window === 'undefined') return
  const shouldWarn =
    invoiceDraftPersistenceStore.state.initialized &&
    !invoiceDraftPersistenceStore.state.saved
  if (shouldWarn && !beforeUnloadAttached) {
    window.addEventListener('beforeunload', onBeforeUnload)
    beforeUnloadAttached = true
  } else if (!shouldWarn && beforeUnloadAttached) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    beforeUnloadAttached = false
  }
}

function createEnvelope(): InvoiceDraftEnvelope {
  return {
    schemaVersion: INVOICE_DRAFT_SCHEMA_VERSION,
    invoice: invoiceDraftStore.state,
    newPosition: invoicePositionDraftStore.state,
  }
}

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function markStorageFailure(error: unknown) {
  setPersistenceState({
    pending: false,
    saved: false,
    error: `Der Invoice Draft konnte nicht in dieser Browsersitzung gespeichert werden. ${messageFor(error, 'Der Sitzungsspeicher ist nicht verfügbar.')}`,
  })
}

function scheduleSave() {
  const saveRevision = ++revision
  const envelope = createEnvelope()
  setPersistenceState({ saved: false, pending: true, error: null })

  const nextWrite = writes.then(async () => {
    // Discard obsolete queued work; an in-flight write is followed by this
    // newest revision in sequence, so it cannot become the final stored value.
    if (saveRevision !== revision) return
    if (!storage) throw new Error('Der Sitzungsspeicher ist nicht verfügbar.')
    await storage.setItem(INVOICE_DRAFT_STORAGE_KEY, envelope)
    if (saveRevision === revision) {
      setPersistenceState({ saved: true, pending: false, error: null })
    }
  })
  writes = nextWrite.catch((error: unknown) => {
    if (saveRevision === revision) markStorageFailure(error)
  })
  return writes
}

function clearSubscriptions() {
  invoiceSubscription?.unsubscribe()
  positionSubscription?.unsubscribe()
  invoiceSubscription = null
  positionSubscription = null
}

function subscribeToDraftChanges() {
  clearSubscriptions()
  invoiceSubscription = invoiceDraftStore.subscribe(scheduleSave)
  positionSubscription = invoicePositionDraftStore.subscribe(scheduleSave)
}

/**
 * Hydrates the Invoice Draft before the editor applies fresh-Invoice defaults,
 * then subscribes both working-state stores to immediate session persistence.
 */
export function initializeInvoiceDraftPersistence(
  suppliedStorage?: InvoiceDraftStorage,
): Promise<void> {
  if (initialization) return initialization

  initialization = (async () => {
    try {
      if (suppliedStorage) {
        storage = suppliedStorage
      } else {
        if (typeof window === 'undefined') {
          throw new Error('Browserspeicher ist während SSR nicht verfügbar.')
        }
        const unstorage = createStorage({
          driver: sessionStorageDriver({ window }),
        })
        storage = unstorage
        ownsStorage = true
      }

      const encoded = await storage.getItem(INVOICE_DRAFT_STORAGE_KEY)
      if (encoded !== null) {
        const parsed = invoiceDraftEnvelopeSchema.safeParse(encoded)
        if (!parsed.success) {
          try {
            await storage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
          } catch {
            // Never partially apply an unsupported draft, even if cleanup fails.
          }
          setPersistenceState({
            initialized: true,
            saved: true,
            pending: false,
            restored: false,
            error:
              'Der gespeicherte Invoice Draft ist ungültig oder nicht kompatibel. Es wurde ein leerer Entwurf geöffnet.',
          })
        } else {
          invoiceDraftStore.setState(() => parsed.data.invoice)
          invoicePositionDraftStore.setState(() => parsed.data.newPosition)
          setPersistenceState({
            initialized: true,
            restored: true,
            saved: true,
            pending: false,
            error: null,
          })
        }
      } else {
        setPersistenceState({
          initialized: true,
          restored: false,
          saved: true,
          pending: false,
          error: null,
        })
      }
    } catch (error) {
      if (ownsStorage) void storage?.dispose?.()
      storage = null
      ownsStorage = false
      setPersistenceState({
        initialized: true,
        restored: false,
        saved: true,
        pending: false,
        error: `Der Sitzungsspeicher für den Invoice Draft ist nicht verfügbar. ${messageFor(error, 'Bitte prüfe die Browserspeichereinstellungen.')}`,
      })
    }

    subscribeToDraftChanges()
  })()
  return initialization
}

/** Wait for the latest queued write and report whether this draft is safe to reload. */
export async function waitForInvoiceDraftPersistence() {
  let observedRevision: number
  do {
    observedRevision = revision
    await writes
  } while (observedRevision !== revision)
  return invoiceDraftPersistenceStore.state.saved
}

/** Clear the old draft before the caller resets visible and in-memory inputs. */
export async function clearStoredInvoiceDraft() {
  const clearRevision = ++revision
  setPersistenceState({ saved: false, pending: true, error: null })
  try {
    await writes
    if (clearRevision !== revision) {
      throw new Error(
        'Der Invoice Draft wurde während des Zurücksetzens geändert.',
      )
    }
    if (!storage) throw new Error('Der Sitzungsspeicher ist nicht verfügbar.')
    await storage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
    if (clearRevision !== revision) {
      await scheduleSave()
      throw new Error(
        'Der Invoice Draft wurde während des Zurücksetzens geändert.',
      )
    }
    setPersistenceState({ saved: true, pending: false, error: null })
  } catch (error) {
    markStorageFailure(error)
    throw error
  }
}

/** Dispose the browser connection; useful when the owning app/test is unmounted. */
export async function disposeInvoiceDraftPersistence() {
  revision += 1
  clearSubscriptions()
  if (beforeUnloadAttached && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload)
    beforeUnloadAttached = false
  }
  if (ownsStorage) await storage?.dispose?.()
  storage = null
  ownsStorage = false
  initialization = null
  writes = Promise.resolve()
  invoiceDraftPersistenceStore.setState(() => ({
    initialized: false,
    restored: false,
    saved: true,
    pending: false,
    error: null,
  }))
}

export function resetInvoiceDraft() {
  invoiceDraftStore.setState(() => createEmptyInvoiceDraft())
  invoicePositionDraftStore.setState(() => ({ description: '', amount: '' }))
}
