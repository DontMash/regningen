import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class LanguageRobot {
  constructor(private readonly page: Page) {}

  async expectGermanLanguage() {
    await expect(this.page.locator('html')).toHaveAttribute('lang', 'de')
  }
}
