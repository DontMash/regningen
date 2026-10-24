import { createStorage } from 'unstorage'
import sessionStorageDriver from 'unstorage/drivers/session-storage'
import { z } from '@/lib/validation'
import * as m from '@/paraglide/messages'
import {
  INVOICE_DRAFT_RESET_STAMP_KEY,
  INVOICE_DRAFT_STORAGE_KEY,
} from './invoice-draft-persistence'
import type { InvoiceDraftPersistence } from './invoice-draft-persistence'

const lineSchema = z
  .object({
    description: z.string(),
    amount: z.string(),
    amountLocale: z.enum(['de', 'en']).optional(),
  })
  .strict()
const envelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    invoice: z
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
        items: z.array(lineSchema),
      })
      .strict(),
    newPosition: lineSchema,
  })
  .strict()

/** Raw storage adapter retained for alternate drivers and existing consumers. */
export interface InvoiceDraftStorage {
  getItem: (key: string) => Promise<unknown | null>
  setItem: (key: string, value: unknown) => Promise<void>
  removeItem: (key: string) => Promise<void>
  dispose?: () => Promise<void>
}

export function createInvoiceDraftPersistence(
  storage: InvoiceDraftStorage,
): InvoiceDraftPersistence {
  return {
    async readDraft() {
      const encoded = await storage.getItem(INVOICE_DRAFT_STORAGE_KEY)
      if (encoded === null) return { status: 'empty' }
      const parsed = envelopeSchema.safeParse(encoded)
      return parsed.success
        ? { status: 'loaded', envelope: parsed.data }
        : { status: 'invalid' }
    },
    async readResetGeneration() {
      const stamp = await storage.getItem(INVOICE_DRAFT_RESET_STAMP_KEY)
      // An unsupported stamp cannot match a valid reset generation.
      return stamp === null || typeof stamp === 'string' ? stamp : ''
    },
    writeDraft: (envelope) =>
      storage.setItem(INVOICE_DRAFT_STORAGE_KEY, envelope),
    writeResetGeneration: (generation) =>
      storage.setItem(INVOICE_DRAFT_RESET_STAMP_KEY, generation),
    clearDraft: () => storage.removeItem(INVOICE_DRAFT_STORAGE_KEY),
    dispose: async () => {
      await storage.dispose?.()
    },
  }
}

export function openBrowserInvoiceDraftPersistence(): InvoiceDraftPersistence {
  if (typeof window === 'undefined') throw new Error(m.invoice_storage_ssr())
  return createInvoiceDraftPersistence(
    createStorage({ driver: sessionStorageDriver({ window }) }),
  )
}
