import type { Metrics } from './vitals-metrics'

// Reviewed from 90 native audits on 2026-10-15, AMD Ryzen AI 9 HX 370/Linux.
// Nine samples per state/device: median + max(20%, noise floor).
// Rounded UP to integer ms / 0.0001 CLS. See docs/vitals.md for context.
// These are fixed regression limits, never rewritten by an ordinary audit run.
export const budgets = {
  homeFirst: {
    mobile: { lcp: 9290, cls: 0.0217, tbt: 98 },
    desktop: { lcp: 1731, cls: 0.0268, tbt: 50 },
  },
  home: {
    mobile: { lcp: 9288, cls: 0.0217, tbt: 68 },
    desktop: { lcp: 1732, cls: 0.0268, tbt: 50 },
  },
  invoice: {
    mobile: { lcp: 13526, cls: 0.0203, tbt: 83 },
    desktop: { lcp: 2360, cls: 0.02, tbt: 50 },
  },
  settings: {
    mobile: { lcp: 9106, cls: 0.0229, tbt: 83 },
    desktop: { lcp: 1708, cls: 0.0234, tbt: 50 },
  },
  profile: {
    mobile: { lcp: 9904, cls: 0.0204, tbt: 62 },
    desktop: { lcp: 1849, cls: 0.02, tbt: 50 },
  },
} satisfies Record<string, Record<'mobile' | 'desktop', Metrics>>
