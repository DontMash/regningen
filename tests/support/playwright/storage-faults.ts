import type { JSHandle, Page } from '@playwright/test'

const businessProfileStorageKey = 'regningen.business-profile'
const releaseNotesStorageKey = 'regningen.release-notes.acknowledged-versions'
const invoiceDraftStorageKey = 'regningen.invoice-draft'

type DraftStorageFault = 'access' | 'read' | 'write' | 'remove'

function installDraftStorageFault({
  storageKey,
  fault,
}: {
  storageKey: string
  fault: DraftStorageFault
}) {
  if (fault === 'access') {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    if (!descriptor) throw new Error('Session storage descriptor unavailable')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Injected draft-session access failure')
      },
    })
    return () => Object.defineProperty(window, 'sessionStorage', descriptor)
  }

  const session = window.sessionStorage
  const { getItem, setItem, removeItem } = Storage.prototype
  Storage.prototype.getItem = function (key) {
    if (this === session && key === storageKey && fault === 'read') {
      throw new Error('Injected draft-session read failure')
    }
    return getItem.call(this, key)
  }
  Storage.prototype.setItem = function (key, value) {
    if (this === session && key === storageKey && fault === 'write') {
      throw new Error('Injected draft-session write failure')
    }
    return setItem.call(this, key, value)
  }
  Storage.prototype.removeItem = function (key) {
    if (this === session && key === storageKey && fault === 'remove') {
      throw new Error('Injected draft-session removal failure')
    }
    return removeItem.call(this, key)
  }
  return () => {
    Storage.prototype.getItem = getItem
    Storage.prototype.setItem = setItem
    Storage.prototype.removeItem = removeItem
  }
}

export class StorageFaults {
  private draftFaultCleanup: JSHandle<() => void> | null = null

  constructor(private readonly page: Page) {}

  async preventDraftRecovery(fault: 'access' | 'read') {
    await this.page.addInitScript(installDraftStorageFault, {
      storageKey: invoiceDraftStorageKey,
      fault,
    })
  }

  async preventDraftPersistence(fault: 'write' | 'remove') {
    this.draftFaultCleanup = await this.page.evaluateHandle(
      installDraftStorageFault,
      { storageKey: invoiceDraftStorageKey, fault },
    )
  }

  async restoreDraftPersistence() {
    await this.draftFaultCleanup?.evaluate((restore) => restore())
    await this.draftFaultCleanup?.dispose()
    this.draftFaultCleanup = null
  }

  async supplyInvalidDraft(kind: 'malformed' | 'unsupported') {
    await this.page.addInitScript(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      {
        key: invoiceDraftStorageKey,
        value:
          kind === 'malformed'
            ? '{invalid json'
            : JSON.stringify({ schemaVersion: 999 }),
      },
    )
  }

  async preventProfileReads() {
    await this.page.addInitScript((storageKey) => {
      const originalGetItem = Storage.prototype.getItem
      Storage.prototype.getItem = function (key) {
        if (key === storageKey) throw new Error('storage unavailable')
        return originalGetItem.call(this, key)
      }
    }, businessProfileStorageKey)
  }

  async preventProfileWrites() {
    await this.page.addInitScript((storageKey) => {
      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) throw new Error('storage unavailable')
        return originalSetItem.call(this, key, value)
      }
    }, businessProfileStorageKey)
  }

  async preventReleaseNotesWrites() {
    await this.page.addInitScript((storageKey) => {
      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) throw new Error('storage unavailable')
        return originalSetItem.call(this, key, value)
      }
    }, releaseNotesStorageKey)
  }
}
