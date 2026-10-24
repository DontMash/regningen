import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Suite, TestCase, TestResult } from '@playwright/test/reporter'
import VitalsReporter from './vitals-reporter'
import {
  budgetFromBaseline,
  budgetViolations,
  medianMetrics,
  measurementProgress,
  metricsFromReport,
  summarizeVitals,
} from './vitals-metrics'

describe('page performance measurements', () => {
  it.each([
    { path: '/de', expectedNoindex: false },
    { path: '/en', expectedNoindex: false },
    { path: '/de/rechnung', expectedNoindex: true },
    { path: '/en/invoice', expectedNoindex: true },
    { path: '/de/einstellungen', expectedNoindex: true },
    { path: '/en/settings/profile', expectedNoindex: true },
    { path: '/de/einstellungen/lizenzen', expectedNoindex: true },
    { path: '/en/settings/licenses', expectedNoindex: true },
    { path: '/another-public-page', expectedNoindex: false },
  ])(
    'annotates $path only as declared ($expectedNoindex), preserving scores and findings',
    ({ path, expectedNoindex }) => {
      const report = {
        audits: {
          'largest-contentful-paint': { numericValue: 1234 },
          'cumulative-layout-shift': { numericValue: 0.03 },
          'total-blocking-time': { numericValue: 45 },
          'is-crawlable': {
            score: 0,
            scoreDisplayMode: 'binary',
            title: 'Page is blocked from indexing',
          },
          'document-title': {
            score: 0,
            scoreDisplayMode: 'binary',
            title: 'Document has no title',
          },
        },
      }
      const original = structuredClone(report)
      const sample = metricsFromReport(report)
      const scores = {
        performance: [70, 80, 90],
        accessibility: [95, 96, 97],
        'best-practices': [90, 91, 92],
        seo: [55, 60, 65],
      }
      const summary = summarizeVitals({
        page: 'screen under audit',
        path,
        device: 'mobile',
        calibration: false,
        measurements: [sample, sample, sample],
        scores,
        budget: { lcp: 1500, cls: 0.05, tbt: 100 },
        expectedNoindex,
      })
      expect(summary.expectedNoindex).toBe(expectedNoindex)
      expect(summary.scores).toEqual({
        performance: 80,
        accessibility: 96,
        'best-practices': 91,
        seo: 60,
      })
      expect(summary.metrics).toEqual({ lcp: 1234, cls: 0.03, tbt: 45 })
      expect(summary.completedRepetitions).toEqual([1, 2, 3])
      expect(summary.missingRepetitions).toEqual([])
      expect(report).toEqual(original)
      expect(scores.seo).toEqual([55, 60, 65])
    },
  )

  it('reports only declared private screens as expected noindex and retains raw report links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vitals-overview-'))
    const cwd = process.cwd()
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      process.chdir(directory)
      const reporter = new VitalsReporter()
      const examples = [
        { path: '/de', expectedNoindex: false },
        { path: '/en', expectedNoindex: false },
        { path: '/de/rechnung', expectedNoindex: true },
        { path: '/en/settings/profile', expectedNoindex: true },
        { path: '/en/settings/licenses', expectedNoindex: true },
      ]
      // Playwright supplies these objects; the fixture provides only reporter-consumed fields.
      const tests = examples.map(({ path }) => ({
        id: path,
        title: path,
        parent: { project: () => ({ name: 'mobile' }) },
      })) as TestCase[]
      reporter.onBegin({}, { allTests: () => tests } as Suite)
      for (const [index, example] of examples.entries()) {
        const summary = summarizeVitals({
          page: example.path,
          ...example,
          device: 'mobile',
          calibration: false,
          measurements: Array.from({ length: 3 }, () => ({
            lcp: 1000,
            cls: 0.01,
            tbt: 50,
          })),
          scores: {
            performance: [80, 80, 80],
            accessibility: [95, 95, 95],
            'best-practices': [90, 90, 90],
            seo: [60, 60, 60],
          },
          budget: { lcp: 1200, cls: 0.02, tbt: 100 },
        })
        // The external runner's timing/worker fields are irrelevant to the reporting contract.
        reporter.onTestEnd(tests[index], {
          status: 'passed',
          attachments: [
            {
              name: 'vitals-summary',
              body: Buffer.from(JSON.stringify(summary)),
              contentType: 'application/json',
            },
            {
              name: 'lighthouse-1.json',
              path: `${example.path}/raw.json`,
              contentType: 'application/json',
            },
          ],
        } as TestResult)
      }
      await reporter.onEnd({
        status: 'passed',
        startTime: new Date(),
        duration: 1,
      })
      const markdown = await readFile(
        join(directory, '.vitals/overview.md'),
        'utf8',
      )
      const overview = JSON.parse(
        await readFile(join(directory, '.vitals/overview.json'), 'utf8'),
      )
      for (const { path, expectedNoindex } of examples) {
        const row = markdown
          .split('\n')
          .find((line) => line.startsWith(`| [${path}]`))
        expect(row).toContain('| 80 | 95 | 90 | 60')
        expect(row?.includes('(expected noindex)')).toBe(expectedNoindex)
        expect(
          overview.rows.find((item: { test: string }) => item.test === path)
            .reports,
        ).toEqual([{ name: 'lighthouse-1.json', path: `${path}/raw.json` }])
      }
      expect(markdown).toContain(
        'Measured **5/5 selected page/device tests**, three navigations each.',
      )
    } finally {
      process.chdir(cwd)
      output.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains verified partial samples without inventing a median for missing repetitions', () => {
    const samples = [{ lcp: 1000, cls: 0.01, tbt: 50 }]
    expect(
      summarizeVitals({
        page: 'interrupted audit',
        path: '/de',
        device: 'desktop',
        calibration: false,
        expectedNoindex: false,
        measurements: samples,
        scores: { seo: [60] },
        budget: null,
      }),
    ).toMatchObject({
      metrics: null,
      scores: null,
      measurements: samples,
      completedRepetitions: [1],
      missingRepetitions: [2, 3],
      expectedNoindex: false,
    })
    expect(measurementProgress(samples)).toEqual({
      measurements: samples,
      metrics: null,
      completedRepetitions: [1],
      missingRepetitions: [2, 3],
    })
    expect(measurementProgress([...samples, ...samples, ...samples])).toEqual({
      measurements: [...samples, ...samples, ...samples],
      metrics: { lcp: 1000, cls: 0.01, tbt: 50 },
      completedRepetitions: [1, 2, 3],
      missingRepetitions: [],
    })
  })

  it('allows boundary values and reports each breached budget without learning new limits', () => {
    const budget = { lcp: 1200, cls: 0.07, tbt: 50 }
    expect(budgetViolations({ ...budget }, budget)).toEqual([])
    expect(budgetViolations({ lcp: 1300, cls: 0.08, tbt: 40 }, budget)).toEqual(
      ['LCP: 1300 exceeds budget 1200', 'CLS: 0.08 exceeds budget 0.07'],
    )
    expect(budget).toEqual({ lcp: 1200, cls: 0.07, tbt: 50 })
    expect(() => budgetViolations(budget, undefined)).toThrow(/Missing/)
    expect(() =>
      budgetViolations(budget, { ...budget, tbt: Number.NaN }),
    ).toThrow(/tbt/)
  })

  it('reads lab metrics and refuses execution errors or missing numeric values', () => {
    const report = {
      audits: {
        'largest-contentful-paint': { numericValue: 1234 },
        'cumulative-layout-shift': { numericValue: 0.03 },
        'total-blocking-time': { numericValue: 45 },
      },
    }
    expect(metricsFromReport(report)).toEqual({ lcp: 1234, cls: 0.03, tbt: 45 })
    expect(() =>
      metricsFromReport({
        audits: {
          ...report.audits,
          'bf-cache': {
            scoreDisplayMode: 'error',
            errorMessage: 'Gatherer crashed',
          },
        },
      }),
    ).toThrow(/bf-cache.*Gatherer crashed/)
    expect(
      metricsFromReport({
        audits: {
          ...report.audits,
          'is-crawlable': { scoreDisplayMode: 'binary' },
        },
      }),
    ).toEqual({ lcp: 1234, cls: 0.03, tbt: 45 })
    expect(() => metricsFromReport({ audits: {} })).toThrow(
      /largest-contentful-paint/,
    )
    expect(() =>
      metricsFromReport({
        ...report,
        runtimeError: { message: 'Navigation failed' },
      }),
    ).toThrow('Navigation failed')
  })

  it('calibrates fixed budgets from nine samples with metric-specific noise floors', () => {
    const samples = [800, 900, 950, 990, 1000, 1050, 1100, 1200, 9000].map(
      (lcp) => ({ lcp, cls: 0.05, tbt: 0 }),
    )
    expect(budgetFromBaseline(samples)).toEqual({
      lcp: 1200,
      cls: 0.07,
      tbt: 50,
    })
    expect(() => budgetFromBaseline(samples.slice(0, 8))).toThrow()
    expect(
      budgetFromBaseline(
        Array.from({ length: 9 }, () => ({
          lcp: 400,
          cls: 0.00001,
          tbt: 400,
        })),
      ),
    ).toEqual({ lcp: 500, cls: 0.0201, tbt: 480 })
  })

  it('uses every repetition to report independent metric medians', () => {
    expect(
      medianMetrics([
        { lcp: 1200, cls: 0.02, tbt: 90 },
        { lcp: 800, cls: 0.08, tbt: 10 },
        { lcp: 1000, cls: 0.01, tbt: 50 },
      ]),
    ).toEqual({ lcp: 1000, cls: 0.02, tbt: 50 })
  })

  it.each([
    [],
    [{ lcp: 1000, cls: 0, tbt: 0 }],
    [
      { lcp: 1000, cls: 0, tbt: 0 },
      { lcp: Number.NaN, cls: 0, tbt: 0 },
      { lcp: 1100, cls: 0, tbt: 0 },
    ],
    Array.from({ length: 3 }, () => ({ lcp: 1000, cls: -1, tbt: 0 })),
  ])('rejects incomplete or invalid repetitions (%#)', (...measurements) => {
    expect(() => medianMetrics(measurements)).toThrow()
  })
})
