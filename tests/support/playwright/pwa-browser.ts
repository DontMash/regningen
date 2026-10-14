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

  async observeWorkerActivation(page: Page) {
    await page.evaluate(() => {
      const observation = { controllerChanges: 0 }
      ;(
        window as Window & { workerObservation?: typeof observation }
      ).workerObservation = observation
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        observation.controllerChanges += 1
      })
    })
  }

  async workerState(page: Page) {
    return page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        active: registration?.active?.state ?? null,
        waiting: registration?.waiting?.state ?? null,
        controllerChanges:
          (
            window as Window & {
              workerObservation?: { controllerChanges: number }
            }
          ).workerObservation?.controllerChanges ?? 0,
      }
    })
  }

  async requestWorkerUpdate(page: Page) {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    })
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
