import { createStorage } from 'unstorage'
import localStorageDriver from 'unstorage/drivers/localstorage'
import type { AcknowledgmentPersistence } from './acknowledgment-persistence'
import { AcknowledgmentPersistenceError } from './acknowledgment-persistence'

const storageKey = 'regningen.release-notes.acknowledged-versions'

async function storageOperation<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    // Runtime defects in this integration must not masquerade as unavailable storage.
    if (cause instanceof TypeError || cause instanceof ReferenceError)
      throw cause
    throw new AcknowledgmentPersistenceError(operation, cause)
  }
}

export function openBrowserAcknowledgmentPersistence(): AcknowledgmentPersistence {
  // Construction remains post-hydration. Delay driver access until an operation
  // so even browsers denying storage access provide a disposable session.
  let storage: ReturnType<typeof createStorage> | undefined
  const getStorage = () => {
    storage ??= createStorage({ driver: localStorageDriver({ window }) })
    return storage
  }
  let disposed = false
  const isDisposed = () => disposed
  let subscription: Promise<void> = Promise.resolve()
  const load = () =>
    storageOperation('read', async () => {
      const value = await getStorage().getItem<unknown>(storageKey)
      return Array.isArray(value)
        ? value.filter(
            (version): version is string => typeof version === 'string',
          )
        : []
    })
  return {
    load,
    acknowledge: (versions) =>
      storageOperation('write', async () => {
        const save = async () => {
          const saved = await load()
          await getStorage().setItem(storageKey, [
            ...new Set([...saved, ...versions]),
          ])
        }
        if ('locks' in window.navigator) {
          await window.navigator.locks.request(storageKey, save)
        } else {
          await save()
        }
      }),
    subscribe: (listener) => {
      subscription = storageOperation('subscribe', async () => {
        await getStorage().watch(async (_event, key) => {
          if (isDisposed() || key !== storageKey) return
          try {
            const versions = await load()
            if (!isDisposed()) listener(versions)
          } catch (error) {
            if (!(error instanceof AcknowledgmentPersistenceError)) throw error
            // An unavailable preference read must not interrupt invoicing.
          }
        })
      })
      return subscription
    },
    dispose: async () => {
      disposed = true
      try {
        await subscription
      } catch (error) {
        if (!(error instanceof AcknowledgmentPersistenceError)) throw error
      } finally {
        await storageOperation('dispose', async () => {
          await storage?.dispose()
        })
      }
    },
  }
}
