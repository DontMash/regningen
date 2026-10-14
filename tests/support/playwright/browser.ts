import type { BrowserContext, CDPSession, Page } from '@playwright/test'

export class BrowserControls {
  private readonly frozenPages = new Map<Page, CDPSession>()

  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
  ) {}

  async open(path: string) {
    await this.page.goto(path)
  }

  async reload() {
    await this.page.reload()
  }

  async cancelReloadAtUnsavedWarning() {
    const warning = this.page.waitForEvent('dialog')
    const reload = this.page.evaluate(() => window.location.reload())
    const dialog = await warning
    const type = dialog.type()
    await dialog.dismiss()
    await reload
    return type
  }

  async goBack() {
    await this.page.evaluate(() => window.history.back())
  }

  async goForward() {
    await this.page.evaluate(() => window.history.forward())
  }

  async setViewport(width: number, height: number) {
    await this.page.setViewportSize({ width, height })
  }

  async scrollPageBy(pixels: number) {
    const viewport = this.page.viewportSize()!
    await this.page.mouse.move(8, viewport.height / 2)
    await this.page.mouse.wheel(0, pixels)
    // Wheel delivery is asynchronous; allow its rendering frames to complete.
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          )
        }),
    )
  }

  async useSystemTheme(colorScheme: 'light' | 'dark') {
    await this.page.emulateMedia({ colorScheme })
  }

  async useReducedMotion(reducedMotion: 'reduce' | 'no-preference') {
    await this.page.emulateMedia({ reducedMotion })
  }

  async waitForFonts() {
    await this.page.evaluate(() => document.fonts.ready)
  }

  async suspendPage(page: Page) {
    const session = await this.context.newCDPSession(page)
    await session.send('Page.setWebLifecycleState', { state: 'frozen' })
    this.frozenPages.set(page, session)
  }

  async resumePage(page: Page) {
    const session = this.frozenPages.get(page)
    if (!session) throw new Error('The page was not suspended.')
    await session.send('Page.setWebLifecycleState', { state: 'active' })
    await session.detach()
    this.frozenPages.delete(page)
    await page.bringToFront()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  }

  async createUnrelatedOriginData() {
    await this.page.evaluate(async () => {
      localStorage.setItem('unrelated.settings-test', 'unrelated local data')
      sessionStorage.setItem(
        'unrelated.settings-test',
        'unrelated session data',
      )
      const cache = await caches.open('unrelated-settings-test-cache')
      await cache.put(
        '/unrelated-settings-resource',
        new Response('unrelated cached data'),
      )
    })
  }

  async unrelatedOriginData() {
    return this.page.evaluate(async () => ({
      local: localStorage.getItem('unrelated.settings-test'),
      session: sessionStorage.getItem('unrelated.settings-test'),
      cached: await (
        await caches.match('/unrelated-settings-resource')
      )?.text(),
    }))
  }

  async openAdditionalPage(path?: string) {
    const page = await this.context.newPage()
    if (path) await page.goto(path)
    return page
  }
}
