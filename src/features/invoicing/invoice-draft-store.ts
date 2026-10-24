import { Store } from '@tanstack/store'
import type { InvoiceDraft, InvoiceLineDraft } from './validation-contract'
import type {
  InvoiceDraftEnvelope,
  InvoiceDraftPersistence,
  OpenInvoiceDraftPersistence,
} from './invoice-draft-persistence'
import * as m from '@/paraglide/messages'
import {
  getApplicationResetGeneration,
  INITIAL_APPLICATION_RESET_GENERATION,
  subscribeToApplicationResetInvalidation,
} from '@/lib/application-reset-generation'

export type { InvoiceDraft, InvoiceLineDraft } from './validation-contract'

export { INVOICE_DRAFT_STORAGE_KEY } from './invoice-draft-persistence'
export type { InvoiceDraftEnvelope } from './invoice-draft-persistence'

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

let storage: InvoiceDraftPersistence | null = null
let openPersistence: OpenInvoiceDraftPersistence | null = null
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
    schemaVersion: 1,
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
    await storage.writeResetGeneration(generation)
    if (saveRevision !== revision) return
    if (generation !== getApplicationResetGeneration()) {
      void invalidateInvoiceDraft(getApplicationResetGeneration()).catch(
        () => {},
      )
      return
    }
    await storage.writeDraft(envelope)
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
  open: OpenInvoiceDraftPersistence,
): Promise<void> {
  if (initialization) return initialization

  openPersistence = open
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
      storage = open()
      const loaded = await storage.readDraft()
      const stamp = await storage.readResetGeneration()
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
        await storage.clearDraft()
        await storage.writeResetGeneration(generation)
        setPersistenceState({
          initialized: true,
          restored: false,
          saved: true,
          pending: false,
          error: null,
        })
      } else if (loaded.status !== 'empty') {
        if (loaded.status === 'invalid') {
          try {
            await storage.clearDraft()
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
          invoiceDraftStore.setState(() => loaded.envelope.invoice)
          invoicePositionDraftStore.setState(() => loaded.envelope.newPosition)
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
      const failedStorage = storage
      storage = null
      // Cleanup must not obscure the hydration failure or skip recovery.
      try {
        await failedStorage?.dispose()
      } catch (cleanupError) {
        console.error('Invoice Draft connection cleanup failed.', cleanupError)
      }
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
    await storage.clearDraft()
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
      if (!openPersistence) throw new Error(m.invoice_storage_unavailable())
      // Reset needs deletion, not a readable envelope. Reopen through the same
      // supplied capability even when initial hydration failed.
      storage = openPersistence()
    }
    await storage.clearDraft()
    await storage.writeResetGeneration(generation)
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
  await initialization
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
  await initialization
  await writes
  // Hydration installs subscriptions in its finally block, including when
  // disposal invalidated its result. Remove those before releasing ownership.
  clearSubscriptions()
  if (beforeUnloadAttached && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload)
    beforeUnloadAttached = false
  }
  await storage?.dispose()
  storage = null
  openPersistence = null
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
