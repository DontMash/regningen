import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

const UNRELATED_CACHE_NAME = 'unrelated-test-cache'
const APPLICATION_CACHE_PREFIX = 'regningen-pwa-assets-'

export class PwaBrowserControls {
  private constructor(readonly context: BrowserContext) {}

  static async create(browser: Browser) {
    return new PwaBrowserControls(await browser.newContext())
  }

  async openPage(path?: string) {
    const page = await this.context.newPage()
    if (path) await page.goto(path)
    return page
  }

  async closePage(page: Page) {
    await page.close()
  }

  async setOffline(offline: boolean) {
    await this.context.setOffline(offline)
  }

  async dispose() {
    await this.context.close()
  }

  async createUnrelatedOriginCache(page: Page) {
    await page.evaluate(async (cacheName) => {
      await caches.open(cacheName)
    }, UNRELATED_CACHE_NAME)
  }

  async applicationCacheNames(page: Page) {
    return page.evaluate(
      async (prefix) =>
        (await caches.keys()).filter((name) => name.startsWith(prefix)),
      APPLICATION_CACHE_PREFIX,
    )
  }

  async cacheNames(page: Page) {
    return page.evaluate(() => caches.keys())
  }

  async announceOffline(page: Page) {
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  }

  async returnToForeground(page: Page) {
    await page.bringToFront()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  }

  async withSnapshotWritesBlocked(page: Page, work: () => Promise<void>) {
    const originalSetter = await page.evaluateHandle(
      () => Storage.prototype.setItem,
    )
    await page.evaluate(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'regningen.pwa.invoice-update') {
          throw new Error('Update snapshot storage unavailable')
        }
        return original.call(this, key, value)
      }
    })
    try {
      await work()
    } finally {
      await page.evaluate((setter) => {
        Storage.prototype.setItem = setter
      }, originalSetter)
      await originalSetter.dispose()
    }
  }

  async holdPreparationResponse(page: Page) {
    const held = await page.evaluateHandle(() => {
      const worker = navigator.serviceWorker.controller
      if (!worker) throw new Error('An active controller is required.')
      const original = worker.postMessage.bind(worker)
      let response: (() => void) | null = null
      worker.postMessage = (message, options) => {
        const send = () =>
          Array.isArray(options)
            ? original(message, options)
            : original(message, options)
        if (message.type === 'PREPARE_RESULT') response = send
        else send()
      }
      return {
        isPrepared: () => response !== null,
        release: () => {
          worker.postMessage = original
          response?.()
        },
      }
    })
    return {
      waitUntilPrepared: async () => {
        await expect
          .poll(() => held.evaluate((state) => state.isPrepared()))
          .toBe(true)
      },
      release: async () => {
        await held.evaluate((state) => state.release())
        await held.dispose()
      },
    }
  }

  get unrelatedCacheName() {
    return UNRELATED_CACHE_NAME
  }
}
