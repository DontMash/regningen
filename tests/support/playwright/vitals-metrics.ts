export type Metrics = { lcp: number; cls: number; tbt: number }

export function metricsFromReport(report: {
  audits: Partial<
    Record<
      string,
      {
        numericValue?: number
        scoreDisplayMode?: string
        errorMessage?: string
      }
    >
  >
  runtimeError?: { message: string }
}): Metrics {
  if (report.runtimeError) throw new Error(report.runtimeError.message)
  for (const [name, audit] of Object.entries(report.audits)) {
    if (audit?.scoreDisplayMode === 'error')
      throw new Error(
        `Lighthouse audit ${name}: ${audit.errorMessage ?? 'execution failed'}`,
      )
  }
  const metric = (name: string) => {
    const value = report.audits[name]?.numericValue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error(`Missing or invalid Lighthouse metric: ${name}`)
    return value
  }
  return {
    lcp: metric('largest-contentful-paint'),
    cls: metric('cumulative-layout-shift'),
    tbt: metric('total-blocking-time'),
  }
}

export function budgetViolations(actual: Metrics, budget: Metrics | undefined) {
  if (!budget)
    throw new Error(
      'Missing calibrated page/device budgets. Collect and review a baseline first.',
    )
  const violations: string[] = []
  for (const key of ['lcp', 'cls', 'tbt'] as const) {
    if (!Number.isFinite(budget[key]) || budget[key] < 0)
      throw new Error(`Invalid ${key} budget.`)
    if (!Number.isFinite(actual[key]) || actual[key] < 0)
      throw new Error(`Invalid ${key} measurement.`)
    if (actual[key] > budget[key])
      violations.push(
        `${key.toUpperCase()}: ${actual[key]} exceeds budget ${budget[key]}`,
      )
  }
  return violations
}

export function budgetFromBaseline(measurements: Metrics[]): Metrics {
  const baseline = medianMetrics(measurements, 9)
  return {
    lcp: Math.ceil(baseline.lcp + Math.max(baseline.lcp * 0.2, 100)),
    cls:
      Math.ceil(
        (baseline.cls + Math.max(baseline.cls * 0.2, 0.02) - Number.EPSILON) *
          10_000,
      ) / 10_000,
    tbt: Math.ceil(baseline.tbt + Math.max(baseline.tbt * 0.2, 50)),
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

export function medianMetrics(
  measurements: Metrics[],
  expected: 3 | 9 = 3,
): Metrics {
  if (measurements.length !== expected)
    throw new Error(`Expected ${expected} complete measurements.`)
  for (const measurement of measurements) {
    for (const key of ['lcp', 'cls', 'tbt'] as const) {
      if (!Number.isFinite(measurement[key]) || measurement[key] < 0)
        throw new Error(`Invalid ${key} measurement.`)
    }
  }
  return {
    lcp: median(measurements.map((value) => value.lcp)),
    cls: median(measurements.map((value) => value.cls)),
    tbt: median(measurements.map((value) => value.tbt)),
  }
}
