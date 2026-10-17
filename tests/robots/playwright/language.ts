import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class LanguageRobot {
  constructor(private readonly page: Page) {}

  async expectGermanLanguage() {
    await this.expectInterfaceLanguage('de')
  }

  async expectInterfaceLanguage(locale: 'de' | 'en') {
    await expect(this.page.locator('html')).toHaveAttribute('lang', locale)
    await expect(
      this.page.getByRole('combobox', {
        name: locale === 'de' ? 'Sprache ändern' : 'Change language',
        exact: true,
      }),
    ).toBeVisible()
  }

  async expectPreferences(
    interfaceLanguage: 'de' | 'en',
    invoiceLanguage: 'auto' | 'de' | 'en',
  ) {
    const interfaceControl = this.page.getByRole('combobox', {
      name:
        interfaceLanguage === 'de'
          ? 'Oberflächensprache'
          : 'Interface language',
      exact: true,
    })
    await expect(interfaceControl).toBeEnabled()
    await expect(interfaceControl).toContainText(
      interfaceLanguage === 'de' ? 'Deutsch' : 'English',
    )
    const invoiceControl = this.page.getByRole('combobox', {
      name:
        interfaceLanguage === 'de' ? 'Rechnungssprache' : 'Invoice language',
      exact: true,
    })
    await expect(invoiceControl).toBeEnabled()
    await expect(invoiceControl).toContainText(
      invoiceLanguage === 'auto'
        ? interfaceLanguage === 'de'
          ? 'Oberflächensprache folgen'
          : 'Follow interface language'
        : invoiceLanguage === 'de'
          ? 'Deutsch'
          : 'English',
    )
  }

  async chooseInvoiceLanguage(locale: 'auto' | 'de' | 'en') {
    await this.page
      .getByRole('combobox', {
        name: /^(Rechnungssprache|Invoice language)$/,
      })
      .click()
    const listbox = this.page.getByRole('listbox')
    await listbox
      .getByRole('option', {
        name:
          locale === 'auto'
            ? /^(Oberflächensprache folgen|Follow interface language)$/
            : locale === 'de'
              ? 'Deutsch'
              : 'English',
        exact: true,
      })
      .click()
    await listbox.waitFor({ state: 'hidden' })
  }

  async expectNoInvoiceLanguageControl() {
    await expect(
      this.page.getByRole('combobox', {
        name: /^(Rechnungssprache|Invoice language)$/,
      }),
    ).toHaveCount(0)
  }

  async changeInterfaceLanguageInSettings(locale: 'de' | 'en') {
    await this.page
      .getByRole('combobox', {
        name: /^(Oberflächensprache|Interface language)$/,
      })
      .click()
    await this.page
      .getByRole('listbox')
      .getByRole('option', {
        name: locale === 'de' ? 'Deutsch' : 'English',
        exact: true,
      })
      .click()
  }

  async expectHeaderChoices(locale: 'de' | 'en') {
    const trigger = this.page.getByRole('combobox', {
      name: /^(Sprache ändern|Change language)$/,
    })
    await expect(trigger).toHaveAttribute('type', 'button')
    await trigger.click()
    await expect(this.page.getByRole('option')).toHaveText([
      'Deutsch',
      'English',
    ])
    await expect(
      this.page.getByRole('option', {
        name: locale === 'de' ? 'Deutsch' : 'English',
        exact: true,
      }),
    ).toHaveAttribute('aria-selected', 'true')
    await this.page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }

  async changeInterfaceLanguageWithKeyboard(locale: 'de' | 'en') {
    const trigger = this.page.getByRole('combobox', {
      name: /^(Sprache ändern|Change language)$/,
    })
    await trigger.focus()
    await trigger.press('Enter')
    await this.page
      .getByRole('option', {
        name: locale === 'de' ? 'Deutsch' : 'English',
        exact: true,
      })
      .press('Enter')
  }

  async changeInterfaceLanguage(locale: 'de' | 'en') {
    await this.page
      .getByRole('combobox', { name: /^(Sprache ändern|Change language)$/ })
      .click()
    await this.page
      .getByRole('listbox')
      .getByRole('option', {
        name: locale === 'de' ? 'Deutsch' : 'English',
        exact: true,
      })
      .click()
  }
}
