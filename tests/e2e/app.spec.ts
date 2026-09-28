import { expect, test } from '@playwright/test'

test('shows the German Regningen shell and opens first-time profile setup', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('regningen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.locator('main')).toHaveCount(1)
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
  await expect(page).toHaveURL(/\/business-profile$/)
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(
    page.getByText(/TanStack Start Base Template|Demos|About This Starter/i),
  ).toHaveCount(0)
})

test('standalone typography matches typeset-default at mobile and desktop widths', async ({
  page,
}) => {
  await page.goto('/business-profile')

  for (const width of [375, 1024]) {
    await page.setViewportSize({ width, height: 800 })

    const styles = await page.evaluate((viewportWidth) => {
      const sample = document.createElement('div')
      sample.className = 'typeset typeset-default'
      sample.innerHTML =
        '<h1>Heading</h1><h3>Brand scale</h3><p>Paragraph</p><div class="footnotes">Supporting text</div>'
      document.body.append(sample)

      const typography = (element: Element) => {
        const style = getComputedStyle(element)
        return [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
        ]
      }
      const compare = (role: string, element: string) => {
        const standalone = document.createElement('div')
        standalone.className = role
        document.body.append(standalone)
        const actual = typography(standalone)
        const expected = typography(sample.querySelector(element)!)
        standalone.remove()
        return { actual, expected }
      }

      const result = {
        heading: compare('heading-1', 'h1'),
        wordmark: compare('wordmark', 'h3'),
        large: compare('paragraph-large', 'p'),
        small: compare('paragraph-small', '.footnotes'),
        ...(viewportWidth >= 768 ? { regular: compare('paragraph', 'p') } : {}),
      }
      sample.remove()
      return result
    }, width)

    for (const { actual, expected } of Object.values(styles)) {
      expect(actual).toEqual(expected)
    }
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

  await expect(themeToggle).toHaveAttribute('title', 'Darstellung: System')

  await themeToggle.click()
  await expect(themeToggle).toHaveAttribute('title', 'Darstellung: Hell')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const lightBackground = await bodyBackground()

  await themeToggle.click()
  await expect(themeToggle).toHaveAttribute('title', 'Darstellung: Dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(bodyBackground).not.toBe(lightBackground)

  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Darstellung umschalten' }),
  ).toHaveAttribute('title', 'Darstellung: Dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('follows the operating-system theme in system mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: 'Darstellung umschalten' }),
  ).toHaveAttribute('title', 'Darstellung: System')
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
