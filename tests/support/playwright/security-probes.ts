import type { BrowserContext, Page } from '@playwright/test'

/** Ordinary parsed/injected scripts, not DevTools eval, exercise the policy. */
export async function installExecutionProbes(
  context: BrowserContext,
  origin: string,
) {
  let prohibitedRequests = 0
  await context.route('https://blocked.security.invalid/**', async (route) => {
    prohibitedRequests += 1
    await route.fulfill({ body: 'blocked fixture', contentType: 'text/plain' })
  })
  await context.route(`${origin}/security-probe.js`, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.securityProbe = { authorized: true, evalBlocked: false, connectionBlocked: false };
try { new Function('window.prohibitedEvaluation = true')(); } catch { window.securityProbe.evalBlocked = true; }
fetch('https://blocked.security.invalid/connect').catch(() => { window.securityProbe.connectionBlocked = true; });`,
    }),
  )
  await context.route(`${origin}/?security-probes`, async (route) => {
    const response = await route.fetch()
    const html = await response.text()
    await route.fulfill({
      response,
      body: html
        .replace(
          '</head>',
          `
<script>window.prohibitedInline = true;</script>
<script src="/security-probe.js"></script>
</head>`,
        )
        .replace(
          '</body>',
          '<img src="https://blocked.security.invalid/image.png" alt=""><button id="security-event-probe" onclick="window.prohibitedHandler = true">Test forbidden handler</button></body>',
        ),
    })
  })
  return { prohibitedRequests: () => prohibitedRequests }
}

export function executionProbeResult(page: Page) {
  return page.evaluate(() => {
    const state = window as Window & {
      securityProbe?: {
        authorized: boolean
        evalBlocked: boolean
        connectionBlocked: boolean
      }
      prohibitedInline?: boolean
      prohibitedHandler?: boolean
      prohibitedEvaluation?: boolean
    }
    return {
      ...state.securityProbe,
      inlineExecuted: state.prohibitedInline === true,
      handlerExecuted: state.prohibitedHandler === true,
      evaluationExecuted: state.prohibitedEvaluation === true,
    }
  })
}

export async function activateProhibitedHandler(page: Page) {
  await page.locator('#security-event-probe').click()
}

export async function frameApplication(page: Page, origin: string) {
  const messages: string[] = []
  page.on('console', (message) => messages.push(message.text()))
  await page.route(`${origin}/security-frame`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Controlled parent</title><iframe src="/invoice"></iframe>',
    }),
  )
  await page.goto(`${origin}/security-frame`)
  return {
    messages: () => [...messages],
    childUrl: () =>
      page
        .frames()
        .find((frame) => frame !== page.mainFrame())
        ?.url(),
    childHasApplication: async () =>
      page
        .frameLocator('iframe')
        .getByRole('heading', { name: 'Rechnung erstellen' })
        .count(),
  }
}

export async function interceptPersonalWebsite(context: BrowserContext) {
  const requests: Array<{ url: string; referer: string | undefined }> = []
  await context.route('https://www.soren.codes/**', async (route) => {
    const request = route.request()
    requests.push({
      url: request.url(),
      referer: (await request.allHeaders()).referer,
    })
    await route.fulfill({
      contentType: 'text/html',
      body: '<title>Controlled destination</title>',
    })
  })
  return { snapshot: () => [...requests] }
}
