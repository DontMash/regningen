import { expect, test } from '@playwright/test'

test('shows the German Regningen shell and opens first-time profile setup', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('regningen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.locator('main')).toHaveCount(1)
  const brand = page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'regningen' })
  await expect(brand).toBeVisible()
  const headerBorder = await page
    .locator('body > header')
    .evaluate((header) => ({
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

  await expect(page.getByRole('contentinfo')).toHaveCount(1)
  await expect(
    page.getByText(/TanStack Start Base Template|Demos|About This Starter/i),
  ).toHaveCount(0)
})

test('shows footer branding and feature destinations', async ({ page }) => {
  await page.goto('/business-profile')

  const footer = page.getByRole('contentinfo')
  await expect(footer).toBeVisible()
  await expect(footer.getByRole('link', { name: 'regningen' })).toHaveAttribute(
    'href',
    '/',
  )
  await expect(footer.locator('img')).toHaveAttribute('src', '/favicon.svg')
  await expect(
    footer.getByText(
      'Rechnungen erstellen und als PDF herunterladen. Direkt im Browser.',
    ),
  ).toBeVisible()
  const features = footer.getByRole('navigation', {
    name: 'Funktionsnavigation',
  })
  await expect(features.getByRole('link')).toHaveCount(2)
  await expect(
    features.getByRole('link', { name: 'Rechnung' }),
  ).toHaveAttribute('href', '/invoice')
  await expect(features.getByRole('link', { name: 'Profile' })).toHaveAttribute(
    'href',
    '/business-profile',
  )
})

test('links the footer attribution to soren in a new tab', async ({ page }) => {
  await page.goto('/business-profile')

  const footer = page.getByRole('contentinfo')
  await expect(footer.getByText('Made with', { exact: false })).toHaveText(
    'Made with love by soren',
  )
  const author = footer.getByRole('link', { name: 'soren' })
  await expect(author).toHaveAttribute('href', 'https://www.soren.codes/')
  await expect(author).toHaveAttribute('target', '_blank')
  await expect(author).toHaveAttribute('rel', /noopener/)
})

test('keeps the footer below the first screen on short pages', async ({
  page,
}) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/not-a-route')
    await expect(
      page.getByRole('heading', { name: 'Seite nicht gefunden' }),
    ).toBeVisible()

    const mainBox = await page.getByRole('main').boundingBox()
    expect(mainBox?.height).toBeGreaterThanOrEqual(800)
    await expect(page.getByRole('contentinfo')).not.toBeInViewport()
  }
})

test('uses smooth scrolling unless reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/business-profile')
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth')
})

test('returns to the header through the keyboard-accessible footer link', async ({
  page,
}) => {
  await page.goto('/business-profile')
  await expect(page.locator('body > header')).toHaveAttribute('id', 'top')
  const backToTop = page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Nach oben' })
  await expect(backToTop).toHaveAttribute('href', '#top')

  await backToTop.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await backToTop.press('Enter')
  await expect(page).toHaveURL(/#top$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
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

  await page.getByRole('button', { name: 'Darstellung umschalten' }).click()
  await expect(
    page.getByRole('button', { name: 'Darstellung umschalten' }),
  ).toHaveAttribute('title', 'Darstellung: System')
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('auto')
  await page.emulateMedia({ colorScheme: 'dark' })
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

test('recovers from an unknown route to first-time profile setup', async ({
  page,
}) => {
  await page.goto('/not-a-route')
  await expect(
    page.getByRole('heading', { name: 'Seite nicht gefunden' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Zur Startseite' }).click()
  await expect(page).toHaveURL(/\/business-profile$/)
  await expect(
    page.getByRole('heading', { name: 'Unternehmensprofil' }),
  ).toBeVisible()
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
