import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import type { Metrics } from './vitals-metrics'

export type VitalsSummary = {
  page: string
  path: string
  device: 'mobile' | 'desktop'
  calibration: boolean
  measurements: Metrics[]
  metrics: Metrics | null
  scores: Record<string, number> | null
  completedRepetitions: number[]
  missingRepetitions: number[]
  budget: Metrics | null
  expectedNoindex: boolean
}

/** Adds a suite overview to Playwright's existing report, not a second report UI. */
export default class VitalsReporter implements Reporter {
  private tests: TestCase[] = []
  private results = new Map<string, TestResult>()

  onBegin(_config: unknown, suite: Suite) {
    this.tests = suite.allTests()
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.results.set(test.id, result)
  }

  async onEnd(run: FullResult) {
    const rows = await Promise.all(
      this.tests.map(async (test) => {
        const result = this.results.get(test.id)
        const attachment = result?.attachments.find(
          (item) => item.name === 'vitals-summary',
        )
        const contents =
          attachment?.body?.toString('utf8') ??
          (attachment?.path
            ? await readFile(attachment.path, 'utf8')
            : undefined)
        const summary: VitalsSummary | null = contents
          ? JSON.parse(contents)
          : null
        return {
          test: test.title,
          device: test.parent.project()?.name,
          status: result?.status ?? 'not run',
          reportLink: `#?testId=${test.id}`,
          reports:
            result?.attachments
              .filter((item) => /^lighthouse-\d+\.(html|json)$/.test(item.name))
              .map(({ name, path }) => ({ name, path: path ?? null })) ?? [],
          summary,
        }
      }),
    )
    const calibration = process.env.VITALS_CALIBRATE === '1'
    const heading = calibration
      ? '# Lighthouse calibration — report-only, NOT a regression verdict'
      : '# Lighthouse page audit and regression results'
    const columns =
      '| Page | Device | Status | Performance | Accessibility | Best Practices | SEO | LCP ms / budget | CLS / budget | TBT ms / budget |'
    const lines = rows.map(({ test, device, status, summary, reportLink }) => {
      const page = `[${test}](${reportLink})`
      if (!summary?.metrics || !summary.scores) {
        const count = summary?.measurements.length ?? 0
        const missing = summary?.missingRepetitions ?? [1, 2, 3]
        return `| ${page} | ${device} | ${status}: ${count}/3 verified; missing ${missing.join(', ')} | — | — | — | — | — | — | — |`
      }
      const { metrics, scores, budget } = summary
      return `| ${page} | ${device} | ${status} | ${scores.performance.toFixed(0)} | ${scores.accessibility.toFixed(0)} | ${scores['best-practices'].toFixed(0)} | ${scores.seo.toFixed(0)}${summary.expectedNoindex ? ' (expected noindex)' : ''} | ${metrics.lcp.toFixed(1)} / ${budget?.lcp ?? 'uncalibrated'} | ${metrics.cls.toFixed(4)} / ${budget?.cls ?? 'uncalibrated'} | ${metrics.tbt.toFixed(1)} / ${budget?.tbt ?? 'uncalibrated'} |`
    })
    const complete = rows.filter((row) => row.summary?.metrics).length
    const markdown = [
      heading,
      '',
      `Run status: **${run.status}**. Measured **${complete}/${rows.length} selected page/device tests**, three navigations each.`,
      'Filters limit this overview to the selected tests; it is not a page-coverage percentage.',
      '',
      columns,
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...lines,
      '',
      'Values are medians. LCP/CLS/TBT are lab metrics, not field INP or Core Web Vitals certification.',
      'Invoice and settings routes intentionally use noindex. Their raw SEO scores/reports are unchanged.',
      'In the Playwright HTML report, page links open the test with individual HTML/JSON reports. overview.json also lists each raw attachment path by repetition.',
      'Missing measurements and operational failures are not low scores; partial samples are retained without an incomplete median.',
      '',
    ].join('\n')
    const directory = resolve('.vitals')
    await mkdir(directory, { recursive: true })
    const overview = resolve(directory, 'overview.md')
    const json = resolve(directory, 'overview.json')
    await writeFile(overview, markdown)
    await writeFile(
      json,
      JSON.stringify({ status: run.status, calibration, rows }, null, 2),
    )
    for (const result of this.results.values()) {
      result.attachments.push(
        {
          name: 'Suite overview',
          path: overview,
          contentType: 'text/markdown',
        },
        {
          name: 'Suite measurements',
          path: json,
          contentType: 'application/json',
        },
      )
    }
    console.log(`\n${markdown}`)
  }
}
