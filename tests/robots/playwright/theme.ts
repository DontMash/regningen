import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export type ThemePreference = 'System' | 'Hell' | 'Dunkel'

export class ThemeRobot {
  constructor(private readonly page: Page) {}

  async cycleTheme() {
    await this.page
      .getByRole('button', { name: 'Darstellung umschalten' })
      .click()
  }

  async expectThemePreference(preference: ThemePreference) {
    await expect(
      this.page.getByRole('button', { name: 'Darstellung umschalten' }),
    ).toHaveAttribute('title', `Darstellung: ${preference}`)
  }

  async expectResolvedTheme(theme: 'light' | 'dark') {
    await expect(this.page.locator('html')).toHaveAttribute('data-theme', theme)
  }
}
