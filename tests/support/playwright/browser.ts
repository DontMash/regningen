import type { BrowserContext, Page } from '@playwright/test'

export class BrowserControls {
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

  async setViewport(width: number, height: number) {
    await this.page.setViewportSize({ width, height })
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

  async openAdditionalPage(path?: string) {
    const page = await this.context.newPage()
    if (path) await page.goto(path)
    return page
  }
}
