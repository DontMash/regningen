import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, expect } from '@playwright/test'
import lighthouse, { desktopConfig, generateReport } from 'lighthouse'
import puppeteer from 'puppeteer-core'
import type {
  BrowserContext,
  BrowserType,
  Page,
  TestInfo,
} from '@playwright/test'
import type { CliFlags, Flags } from 'lighthouse'
import type { PlaywrightRobots } from './playwright'
import type { Metrics } from './vitals-metrics'
import type { VitalsSummary } from './vitals-reporter'
import { createRobotsForPage } from './playwright'
import { coldNavigation } from './vitals-browser'
import {
  budgetViolations,
  median,
  measurementProgress,
  metricsFromReport,
} from './vitals-metrics'

const categories = ['performance', 'accessibility', 'best-practices', 'seo']

type Device = 'mobile' | 'desktop'
type AuditPage = PlaywrightRobots & { page: Page }
type AuditOptions = {
  path: string
  budgets: Record<Device, Metrics> | undefined
  prepare: (screen: AuditPage) => Promise<void>
  verify: (screen: AuditPage) => Promise<void>
}

class PageVitals {
  constructor(
    private readonly chromium: BrowserType,
    private readonly info: TestInfo,
  ) {}

  async audit({ path, budgets, prepare, verify }: AuditOptions) {
    const device = this.info.project.name
    if (device !== 'mobile' && device !== 'desktop')
      throw new Error(`Unknown Lighthouse device: ${device}`)
    const baseURL = this.info.project.use.baseURL
    if (!baseURL) throw new Error('A production baseURL is required.')
    const url = new URL(path, baseURL).href
    const measurements: Metrics[] = []
    const scores: Record<string, number[]> = {}
    const calibration = process.env.VITALS_CALIBRATE === '1'
    const budget = budgets?.[device]
    let metrics: Metrics | null = null
    try {
      for (const repetition of [1, 2, 3]) {
        await test.step(`Lighthouse ${device} measurement ${repetition}/3`, async () => {
          const profile = await mkdtemp(join(tmpdir(), 'regningen-vitals-'))
          let context: BrowserContext | undefined
          let attached:
            Awaited<ReturnType<typeof puppeteer.connect>> | undefined
          try {
            context = await this.chromium.launchPersistentContext(profile, {
              headless: true,
              baseURL,
              locale: 'de-DE',
              timezoneId: 'Europe/Berlin',
              colorScheme: 'light',
              viewport:
                device === 'mobile'
                  ? { width: 412, height: 823 }
                  : { width: 1350, height: 940 },
              args: [
                '--remote-debugging-address=127.0.0.1',
                '--remote-debugging-port=0',
                '--lang=de-DE',
              ],
            })
            const page = context.pages()[0]
            const screen = { page, ...createRobotsForPage(page) }
            await prepare(screen)
            await coldNavigation(page, baseURL)
            const [port] = (
              await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
            ).split('\n')
            attached = await puppeteer.connect({
              browserURL: `http://127.0.0.1:${port}`,
              defaultViewport: null,
            })
            // URLs and page ordering are not tab identity: match the CDP target.
            const session = await context.newCDPSession(page)
            const { targetInfo } = await session.send('Target.getTargetInfo')
            await session.detach()
            const candidates = await attached.pages()
            let measuredPage: (typeof candidates)[number] | undefined
            for (const candidate of candidates) {
              const candidateSession = await candidate.createCDPSession()
              const candidateInfo = await candidateSession.send(
                'Target.getTargetInfo',
              )
              await candidateSession.detach()
              if (candidateInfo.targetInfo.targetId === targetInfo.targetId)
                measuredPage = candidate
            }
            if (!measuredPage)
              throw new Error('The UI-prepared tab was not found.')
            const flags: Flags & Pick<CliFlags, 'enableErrorReporting'> = {
              disableStorageReset: true,
              enableErrorReporting: false,
              onlyCategories: categories,
              logLevel: 'error',
            }
            const result = await lighthouse(
              url,
              flags,
              device === 'desktop' ? desktopConfig : undefined,
              measuredPage,
            )
            if (!result) throw new Error('Lighthouse did not produce a report.')
            const { lhr } = result
            for (const [extension, body, contentType] of [
              ['json', JSON.stringify(lhr), 'application/json'],
              ['html', generateReport(lhr, 'html'), 'text/html'],
            ]) {
              const name = `lighthouse-${repetition}.${extension}`
              const reportPath = this.info.outputPath(name)
              await writeFile(reportPath, body)
              await this.info.attach(name, { path: reportPath, contentType })
            }
            const sample = metricsFromReport(lhr)
            const categoryScores: Record<string, number> = {}
            for (const category of categories) {
              if (!Object.hasOwn(lhr.categories, category))
                throw new Error(`Missing Lighthouse category: ${category}`)
              const score = lhr.categories[category].score
              if (typeof score !== 'number' || !Number.isFinite(score))
                throw new Error(`Missing Lighthouse category: ${category}`)
              categoryScores[category] = score * 100
            }
            await expect(page).toHaveURL(url)
            await screen.language.expectGermanLanguage()
            await screen.theme.expectResolvedTheme('light')
            await verify(screen)
            await expect
              .poll(() =>
                page.evaluate(
                  async () =>
                    (await navigator.serviceWorker.getRegistrations()).length,
                ),
              )
              .toBeGreaterThan(0)
            measurements.push(sample)
            for (const category of categories)
              (scores[category] ??= []).push(categoryScores[category])
          } finally {
            await attached?.disconnect()
            try {
              await context?.close()
            } finally {
              await rm(profile, { recursive: true, force: true })
            }
          }
        })
      }
    } finally {
      const progress = measurementProgress(measurements)
      metrics = progress.metrics
      await this.info.attach('vitals-summary', {
        body: JSON.stringify({
          page: this.info.title,
          path,
          device,
          calibration,
          ...progress,
          scores: metrics
            ? Object.fromEntries(
                Object.entries(scores).map(([key, values]) => [
                  key,
                  median(values),
                ]),
              )
            : null,
          budget: budget ?? null,
          expectedNoindex: path !== '/',
        } satisfies VitalsSummary),
        contentType: 'application/json',
      })
    }
    if (!metrics) throw new Error('Incomplete Lighthouse measurements.')
    if (calibration) {
      this.info.annotations.push({
        type: 'calibration',
        description: 'Report-only: budgets are NOT enforced.',
      })
      return
    }
    expect(
      budgetViolations(metrics, budget),
      `${device} performance budgets`,
    ).toEqual([])
  }
}

export const test = base.extend<{ vitals: PageVitals }>({
  vitals: async ({ playwright }, use, info) => {
    await use(new PageVitals(playwright.chromium, info))
  },
})
