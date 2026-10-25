import { describe, expect, it } from 'vitest'
import {
  budgetFromBaseline,
  budgetViolations,
  medianMetrics,
  metricsFromReport,
} from './vitals-metrics'

describe('page performance measurements', () => {
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
    expect(() => budgetViolations({ ...budget, lcp: -1 }, budget)).toThrow(
      /lcp/,
    )
  })

  it('reads lab metrics without changing raw findings and refuses execution errors', () => {
    const report = {
      audits: {
        'largest-contentful-paint': { numericValue: 1234 },
        'cumulative-layout-shift': { numericValue: 0.03 },
        'total-blocking-time': { numericValue: 45 },
        'is-crawlable': { scoreDisplayMode: 'binary' },
      },
    }
    const original = structuredClone(report)
    expect(metricsFromReport(report)).toEqual({ lcp: 1234, cls: 0.03, tbt: 45 })
    expect(report).toEqual(original)
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
    expect(() => metricsFromReport({ audits: {} })).toThrow(
      /largest-contentful-paint/,
    )
    expect(() =>
      metricsFromReport({
        ...report,
        runtimeError: { message: 'Navigation failed' },
      }),
    ).toThrow('Navigation failed')
    for (const numericValue of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() =>
        metricsFromReport({
          audits: {
            ...report.audits,
            'total-blocking-time': { numericValue },
          },
        }),
      ).toThrow(/total-blocking-time/)
    }
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
    Array.from({ length: 4 }, () => ({ lcp: 1000, cls: 0, tbt: 0 })),
  ])('rejects incomplete or invalid repetitions (%#)', (...measurements) => {
    expect(() => medianMetrics(measurements)).toThrow()
  })
})
