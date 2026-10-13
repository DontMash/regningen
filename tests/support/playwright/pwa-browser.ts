import type { Browser, BrowserContext, Page } from '@playwright/test'

const UNRELATED_CACHE_NAME = 'unrelated-test-cache'

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

  async cacheNames(page: Page) {
    return page.evaluate(() => caches.keys())
  }

  async fetchResource(page: Page, pathname: string) {
    return page.evaluate(async (path) => {
      const response = await fetch(path)
      return { status: response.status, body: await response.text() }
    }, pathname)
  }

  async announceOffline(page: Page) {
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  }

  async returnToForeground(page: Page) {
    await page.bringToFront()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  }

  get unrelatedCacheName() {
    return UNRELATED_CACHE_NAME
  }
}
