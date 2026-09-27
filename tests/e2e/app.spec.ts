import { expect, test } from '@playwright/test'

test('shows the German, blank Regningen shell without starter content', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('regningen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  const brand = page.getByRole('link', { name: 'regningen' })
  await expect(brand).toBeVisible()
  const headerBorder = await page.locator('header').evaluate((header) => ({
    actual: getComputedStyle(header).borderBottomColor,
    expected: getComputedStyle(document.documentElement)
      .getPropertyValue('--border')
      .trim(),
  }))
  expect(headerBorder.actual).toBe(headerBorder.expected)
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter Variable/)
  await expect(brand).toHaveCSS('font-family', /Lora Variable/)
  await expect(page.locator('main')).toBeEmpty()
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(
    page.getByText(/TanStack Start Base Template|Demos|About This Starter/i),
  ).toHaveCount(0)
})

test('does not serve the removed demo routes', async ({ page }) => {
  for (const route of [
    '/demo/form/simple',
    '/demo/form/address',
    '/demo/store',
    '/demo/tanstack-query',
  ]) {
    const response = await page.goto(route)
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole('heading', { name: 'Seite nicht gefunden' }),
    ).toBeVisible()
  }
})

test('cycles and persists the selected theme mode', async ({ page }) => {
  await page.goto('/')

  const themeToggle = page.getByRole('button', {
    name: 'Darstellung umschalten',
  })
  const bodyBackground = () =>
    page
      .locator('body')
      .evaluate((body) => getComputedStyle(body).backgroundColor)

  await expect(themeToggle).toHaveText('System')

  await themeToggle.click()
  await expect(themeToggle).toHaveText('Hell')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const lightBackground = await bodyBackground()

  await themeToggle.click()
  await expect(themeToggle).toHaveText('Dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(bodyBackground).not.toBe(lightBackground)

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Darstellung umschalten' }),
  ).toHaveText('Dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('follows the operating-system theme in system mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: 'Darstellung umschalten' }),
  ).toHaveText('System')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('updates when the operating-system theme changes in system mode', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
