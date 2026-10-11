import type { Page } from '@playwright/test'

const businessProfileStorageKey = 'regningen.business-profile'

export class StorageFaults {
  constructor(private readonly page: Page) {}

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
}
