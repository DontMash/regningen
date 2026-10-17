import { Store } from '@tanstack/store'
import { createStorage } from 'unstorage'
import sessionStorageDriver from 'unstorage/drivers/session-storage'
import type { InvoiceDraft, InvoiceLineDraft } from './invoice'
import { z } from '@/lib/validation'
import * as m from '@/paraglide/messages'
import {
  getApplicationResetGeneration,
  INITIAL_APPLICATION_RESET_GENERATION,
  subscribeToApplicationResetInvalidation,
} from '../settings/reset-generation'

export type { InvoiceDraft, InvoiceLineDraft } from './invoice'

export const INVOICE_DRAFT_STORAGE_KEY = 'regningen.invoice-draft'
const INVOICE_DRAFT_SCHEMA_VERSION = 1
const INVOICE_DRAFT_RESET_STAMP_KEY = 'regningen.invoice-draft.reset-generation'

const invoiceLineDraftSchema = z
  .object({
    description: z.string(),
    amount: z.string(),
    amountLocale: z.enum(['de', 'en']).optional(),
  })
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
let resetSubscription: (() => void) | null = null
let applicationResetGeneration = getApplicationResetGeneration()
let applicationResetting = false
let resetWork: Promise<void> | null = null

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
    error: m.invoice_storage_save_failed({
      error: messageFor(error, m.invoice_storage_unavailable()),
    }),
  })
}

function scheduleSave() {
  if (applicationResetting) return writes
  const generation = getApplicationResetGeneration()
  if (generation !== applicationResetGeneration) {
    void invalidateInvoiceDraft(generation).catch(() => {})
    return writes
  }
  const saveRevision = ++revision
  const envelope = createEnvelope()
  setPersistenceState({ saved: false, pending: true, error: null })

  const nextWrite = writes.then(async () => {
    // Discard obsolete queued work; an in-flight write is followed by this
    // newest revision in sequence, so it cannot become the final stored value.
    if (saveRevision !== revision) return
    if (generation !== getApplicationResetGeneration()) {
      void invalidateInvoiceDraft(getApplicationResetGeneration()).catch(
        () => {},
      )
      return
    }
    if (!storage) throw new Error(m.invoice_storage_unavailable())
    await storage.setItem(INVOICE_DRAFT_RESET_STAMP_KEY, generation)
    if (saveRevision !== revision) return
    if (generation !== getApplicationResetGeneration()) {
      void invalidateInvoiceDraft(getApplicationResetGeneration()).catch(
        () => {},
      )
      return
    }
    await storage.setItem(INVOICE_DRAFT_STORAGE_KEY, envelope)
    if (saveRevision !== revision) return
    if (generation !== getApplicationResetGeneration()) {
      void invalidateInvoiceDraft(getApplicationResetGeneration()).catch(
        () => {},
      )
      return
    }
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

  const initializationRevision = revision
  applicationResetGeneration = getApplicationResetGeneration()
  resetSubscription = subscribeToApplicationResetInvalidation(() => {
    const generation = getApplicationResetGeneration()
    if (generation !== applicationResetGeneration) {
      return invalidateInvoiceDraft(generation)
    }
    return resetWork ?? writes
  })
  initialization = (async () => {
    try {
      if (suppliedStorage) {
        storage = suppliedStorage
      } else {
        if (typeof window === 'undefined') {
          throw new Error(m.invoice_storage_ssr())
        }
        const unstorage = createStorage({
          driver: sessionStorageDriver({ window }),
        })
        storage = unstorage
        ownsStorage = true
      }

      const encoded = await storage.getItem(INVOICE_DRAFT_STORAGE_KEY)
      const stamp = await storage.getItem(INVOICE_DRAFT_RESET_STAMP_KEY)
      if (initializationRevision !== revision) {
        setPersistenceState({ initialized: true })
        return
      }
      const generation = getApplicationResetGeneration()
      const stale =
        generation !== applicationResetGeneration ||
        (stamp !== generation &&
          (stamp !== null ||
            generation !== INITIAL_APPLICATION_RESET_GENERATION))
      if (stale) {
        applicationResetGeneration = generation
        resetInvoiceDraft()
        await storage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
        await storage.setItem(INVOICE_DRAFT_RESET_STAMP_KEY, generation)
        setPersistenceState({
          initialized: true,
          restored: false,
          saved: true,
          pending: false,
          error: null,
        })
      } else if (encoded !== null) {
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
            error: m.invoice_storage_invalid(),
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
        error: m.invoice_storage_load_failed({
          error: messageFor(error, m.invoice_storage_settings()),
        }),
      })
    } finally {
      subscribeToDraftChanges()
    }
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
  const generation = getApplicationResetGeneration()
  const clearRevision = ++revision
  setPersistenceState({ saved: false, pending: true, error: null })
  try {
    await writes
    if (clearRevision !== revision) {
      throw new Error(m.invoice_storage_changed())
    }
    if (!storage) throw new Error(m.invoice_storage_unavailable())
    await storage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
    if (clearRevision !== revision) {
      if (generation === getApplicationResetGeneration()) await scheduleSave()
      throw new Error(m.invoice_storage_changed())
    }
    setPersistenceState({ saved: true, pending: false, error: null })
  } catch (error) {
    if (clearRevision === revision) markStorageFailure(error)
    throw error
  }
}

function invalidateInvoiceDraft(generation: string): Promise<void> {
  if (
    applicationResetting &&
    generation === applicationResetGeneration &&
    resetWork
  ) {
    return resetWork
  }
  applicationResetting = true
  applicationResetGeneration = generation
  const resetRevision = ++revision
  resetInvoiceDraft()
  setPersistenceState({
    restored: false,
    saved: false,
    pending: true,
    error: null,
  })
  const clearing = writes.then(async () => {
    await initialization
    if (!storage) {
      if (typeof window === 'undefined') {
        throw new Error(m.invoice_storage_unavailable())
      }
      // Reset must be retryable after a failed hydration, and needs deletion,
      // not a readable or compatible saved envelope.
      storage = createStorage({ driver: sessionStorageDriver({ window }) })
      ownsStorage = true
    }
    await storage.removeItem(INVOICE_DRAFT_STORAGE_KEY)
    await storage.setItem(INVOICE_DRAFT_RESET_STAMP_KEY, generation)
    if (resetRevision === revision) {
      resetInvoiceDraft()
      setPersistenceState({ saved: true, pending: false, error: null })
    }
  })
  writes = clearing.catch((error: unknown) => {
    if (resetRevision === revision) markStorageFailure(error)
  })
  resetWork = clearing.finally(() => {
    if (resetRevision === revision) applicationResetting = false
  })
  // Ordinary autosaving consumes errors through the persistence state. Reset
  // completion consumes this unswallowed promise instead, so it cannot reload
  // after a failed deletion discovered before the browser's storage event.
  void resetWork.catch(() => {})
  return resetWork
}

/** Application reset discards working inputs without autosaving an empty envelope. */
export async function clearInvoiceDraftForApplicationReset(generation: string) {
  await initializeInvoiceDraftPersistence()
  await invalidateInvoiceDraft(generation)
}

/** Dispose the browser connection; useful when the owning app/test is unmounted. */
export async function disposeInvoiceDraftPersistence() {
  revision += 1
  clearSubscriptions()
  resetSubscription?.()
  resetSubscription = null
  applicationResetting = false
  resetWork = null
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
