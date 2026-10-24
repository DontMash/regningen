import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export type ThemePreference = 'System' | 'Hell' | 'Dunkel' | 'Light' | 'Dark'

export class ThemeRobot {
  constructor(private readonly page: Page) {}

  private shortcut() {
    return this.page.getByRole('button', {
      name: /^(Darstellung umschalten|Toggle appearance)$/,
    })
  }

  async cycleTheme() {
    await this.shortcut().click()
  }

  async cycleThemeWithKeyboard() {
    const control = this.shortcut()
    await control.focus()
    await expect(control).toBeFocused()
    await control.press('Enter')
  }

  async expectThemePreference(preference: ThemePreference) {
    await expect(this.shortcut()).toHaveAttribute(
      'title',
      new RegExp(`^(Darstellung|Appearance): ${preference}$`),
    )
  }

  async expectSessionWarning(locale: 'de' | 'en') {
    const warning = this.page.getByRole('alert').filter({
      hasText:
        locale === 'de'
          ? 'Darstellung konnte nicht gespeichert werden. Die Auswahl gilt für diese Sitzung.'
          : 'Appearance could not be saved. Your choice applies for this session.',
    })
    await expect(warning).toBeVisible()
  }

  async expectResolvedTheme(theme: 'light' | 'dark') {
    await expect(this.page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(this.page.locator('html')).toHaveCSS('color-scheme', theme)
  }
}
