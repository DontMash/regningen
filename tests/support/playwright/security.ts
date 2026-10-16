import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'

export class SecurityDiagnostics {
  readonly violations: Array<{ directive: string; blocked: string }> = []
  readonly errors: string[] = []

  async observe(context: BrowserContext) {
    await context.exposeBinding(
      '__observeSecurityViolation',
      (_source, violation: { directive: string; blocked: string }) => {
        this.violations.push(violation)
      },
    )
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        const report = (
          window as unknown as Window & {
            __observeSecurityViolation: (violation: {
              directive: string
              blocked: string
            }) => Promise<void>
          }
        ).__observeSecurityViolation
        void report({
          directive: event.effectiveDirective,
          blocked: event.blockedURI,
        })
      })
    })
    context.on('page', (page) => {
      page.on('pageerror', (error) => this.errors.push(error.message))
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          /content security policy|unsafe-eval/i.test(message.text())
        ) {
          this.errors.push(message.text())
        }
      })
    })
    context.on('serviceworker', (worker) => {
      worker.on('console', (message) => {
        if (message.type() === 'error') this.errors.push(message.text())
      })
    })
  }
}

export async function scriptAuthorizations(html: string) {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(html)
  try {
    return Array.from(
      dom.window.document.querySelectorAll('script'),
      (script) => ({
        nonce: script.nonce,
        source: script.src,
        type: script.type,
      }),
    )
  } finally {
    dom.window.close()
  }
}

export async function representativeGeneratedAssets(publicDirectory: string) {
  const assets = await readdir(join(publicDirectory, 'assets'))
  return [
    ['.js', 'javascript'],
    ['.css', 'text/css'],
    ['.woff2', 'font/woff2'],
  ].map(([extension, mime]) => {
    const file = assets.find((name) => name.endsWith(extension))
    if (!file) throw new Error(`Missing generated ${extension} resource.`)
    return { path: `/assets/${file}`, mime }
  })
}

export async function deniedCapabilities(page: Page) {
  return page.evaluate(() => {
    const policy = (
      document as Document & {
        featurePolicy: { allowsFeature: (name: string) => boolean }
      }
    ).featurePolicy
    return ['camera', 'microphone', 'geolocation'].map((name) =>
      policy.allowsFeature(name),
    )
  })
}
