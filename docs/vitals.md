# Native Lighthouse lab audits

Page-oriented Playwright tests run Lighthouse against a fresh native production build. There is no Docker/preparation workflow or separate audit runner.

`pnpm test:vitals` is a local production Lighthouse **lab** suite, not a deployment test or real-user Core Web Vitals certification. Navigation audits measure LCP, CLS, and TBT, **not field INP**.

## Install and run

Use the project's Node/pnpm environment. Install dependencies and Chromium through ordinary project tooling before testing:

```sh
pnpm install
pnpm exec playwright install chromium
# Install browser system dependencies through Playwright tooling if your OS needs them.
pnpm test:vitals
```

There is no Docker or preparation command, separate tools installation, custom launcher, or hidden browser/dependency download during tests. Missing dependencies must fail with actionable instructions.

The command runs Playwright with `playwright.vitals.config.ts`; page-oriented specs live in `tests/e2e/<page>.vitals.spec.ts` and are excluded from ordinary `pnpm test:e2e`. Shared technical fixtures/support live under `tests/support/playwright/`.

Playwright's `webServer` must make a fresh full `pnpm build` (including PWA finalization), then serve the generated production server. Build and runtime both use `ORIGIN=http://127.0.0.1:4173` and `TRUST_PROXY=false`; no existing server or stale build is reused. This builds the current working application **in place**, replacing normal generated build files including `.output`. There are no repository snapshots. Avoid concurrent builds/servers using those outputs or port.

## What is measured

Five independent states each use Lighthouse's actual **mobile and desktop presets**, including their device/throttling assumptions. Three sequential, independent measurements per state/device produce **30 audits**; no parallel audits or retries that mask a failed measurement.

1. `home-first`: `/`, genuine first-visit state with automatic release notes present.
2. `home`: `/`, release notes acknowledged through their UI.
3. `invoice`: `/invoice`, saved fictional Business Profile and populated fictional Invoice Draft.
4. `settings`: `/settings`, normal Allgemein screen, notes acknowledged.
5. `profile`: `/settings/profile`, saved fictional Business Profile open for editing, notes acknowledged.

Use existing feature robots and deterministic fictional data from `tests/scenarios/`. Profile saving, draft entry, and acknowledgment cross the UI, never storage seeding. All states use German UI, `de-DE` browser locale, Europe/Berlin timezone, and light presentation; first visit keeps the automatic notes and uses a light system preference. Check prerequisites through the UI and verify the intended screen/data after measurement; a missing-profile prompt is not the populated Invoice editor.

Every repetition starts with fresh test-owned browser state. Before measured navigation, technical support clears HTTP/browser caches, service workers/controllers, and Cache Storage while retaining UI-created local storage and the **same tab's session storage**. Normal production PWA startup remains enabled. This is cold navigation, not offline or warm-cache performance.

Playwright prepares the UI; Puppeteer connects through CDP to that **exact tab** for the public Lighthouse Node navigation API. Lighthouse must preserve the UI-created storage. Opening a different tab loses the Invoice Draft's `sessionStorage`. No Lighthouse CI internals or custom exporter are used.

## Gates and reports

All four categories—Performance, Accessibility, Best Practices, and SEO—are reported. Default runs gate **only LCP, CLS, and TBT medians**, calculated independently from all three measurements per state/device, against explicit committed budgets. Exceeding a budget fails; missing budgets never silently select report-only mode. Other findings/category scores are informational.

Each `vitals.audit()` caller declares `expectedNoindex`: `false` for public introductions (German and English), `true` for intentionally private Invoice and settings screens (including Business Profile and licenses). The summary/overview uses only this explicit expectation, never the URL shape, to annotate expected `is-crawlable` findings. Keep unrelated SEO findings and public introduction crawlability visible. Raw Lighthouse reports and scores stay untouched. Focused summary tests cover both public languages and private examples without adding measurement states.

Open the Playwright HTML report, with raw Lighthouse **HTML and JSON attached for every measurement** and a **Suite overview** attachment across the selected page/device tests:

```sh
pnpm exec playwright show-report .vitals/playwright-report

# Narrow a run using normal Playwright filters:
pnpm test:vitals invoice.vitals.spec.ts --project mobile
```

The overview is also available at `.vitals/overview.md` and `.vitals/overview.json`; test artifacts live in `.vitals/test-results/`. Everything under `.vitals/` is ignored by Git. Raw Lighthouse reports retain actual browser/Lighthouse versions, measurement settings, and diagnostics. No source snapshot or hardware-comparison manifest is generated.

Reports follow Playwright's **latest-run** lifecycle, not a historical archive. Each overview identifies the selected tests, their status, and any missing measurements; filtered runs do not claim full coverage. Copy the complete HTML report and attachments privately before another run replaces them if you need history. There is no automatic archive/comparison service or upload.

Build, readiness, setup/state, browser/Lighthouse execution, and invalid or missing measurements/reports return nonzero in both modes. Every selected page/device test requires all three measurements; a failed repetition cannot be dropped. An unfiltered run selects all ten page/device tests (30 audits). Budget failures also return nonzero in default mode.

## Calibration

Default execution always validates fixed budgets. To establish them, explicitly select report-only calibration:

```sh
# POSIX shell; repeat the complete suite three times on the current machine.
VITALS_CALIBRATE=1 pnpm test:vitals
```

In PowerShell, set `$env:VITALS_CALIBRATE = '1'`, run `pnpm test:vitals` three times, then use `Remove-Item Env:VITALS_CALIBRATE`. Unset the variable before default regression verification in any shell.

Three complete runs yield **nine values per metric/state/device** (90 audits total). For each, use `base = median(all nine values)` and candidate upper budget `base + max(20% of base, floor)`. Floors are **LCP 100 ms**, **TBT 50 ms**, and **CLS 0.02** (unitless). Review variation and the actual environment, then explicitly commit the reviewed per-state/device budgets. Finally run default `pnpm test:vitals` against those budgets.

Calibration still fails for real execution errors or missing measurements, but does not enforce regression budgets or automatically write them. A completed calibration run is **not a regression pass**. There is no automatic ratcheting, cross-hardware normalization, or historical comparison service.

### Initial baseline: 2026-10-15

Three complete sequential runs passed (4.7, 4.6, and 4.6 minutes): **90 audits**, nine samples per state/device. The current working application was measured on native Linux x86-64, kernel `7.2.5-3-omarchy`, AMD Ryzen AI 9 HX 370. Versions: Node `26.8.1`, pnpm `11.25.0`, Playwright `1.63.0`, Chromium `153.0.8010.12`, Lighthouse `13.5.0`, Puppeteer Core `25.14.0`. Existing local UI edits were present during calibration; unrelated UI changes are not part of this feature's commit.

| State / device       | LCP median ms (sample range) | CLS median | TBT median ms (sample range) |
| -------------------- | ---------------------------- | ---------- | ---------------------------- |
| home-first / mobile  | 7741.2 (7736.4–7743.9)       | 0.0016034  | 47.5 (24.5–51.5)             |
| home / mobile        | 7739.7 (7737.8–7743.2)       | 0.0016034  | 18 (5–19)                    |
| invoice / mobile     | 11271.3 (11263.2–11329.4)    | 0.0002632  | 33 (26–91)                   |
| settings / mobile    | 7588.2 (7587.5–7595.2)       | 0.0028767  | 32.5 (6–61.5)                |
| profile / mobile     | 8253.2 (8240.8–8280.6)       | 0.0003753  | 11.5 (4–41)                  |
| home-first / desktop | 1442.5 (1441.8–1443.0)       | 0.0067466  | 0 (0–3.5)                    |
| home / desktop       | 1442.9 (1441.6–1443.8)       | 0.0067466  | 0 (0–0)                      |
| invoice / desktop    | 1966.6 (1964.1–1975.7)       | 0          | 0 (0–0)                      |
| settings / desktop   | 1423.2 (1422.1–1443.0)       | 0.0033727  | 0 (0–0)                      |
| profile / desktop    | 1540.1 (1537.7–1547.7)       | 0          | 0 (0–0)                      |

All three suite medians for every metric fit the formula-derived budgets in `tests/support/playwright/vitals-budgets.ts`. LCP's largest individual sample spread was about 66 ms. Mobile Invoice TBT included a retained 91 ms sample; its three suite medians were 49, 27, and 39 ms against an 83 ms budget. No samples were dropped and no limits were widened. Budgets round upward to integer milliseconds and 0.0001 CLS so rounding cannot remove the agreed noise allowance.

These limits protect the measured baseline, not a claim of good mobile performance: the high mobile LCP values remain visible. Other platforms/hardware have not been calibrated. Recalibration is an explicit review, not a way to automatically make regressions pass.

## Privacy and comparable results

Lighthouse runs locally with `enableErrorReporting: false`. No PageSpeed Insights, report uploads, remote Lighthouse service, or hosted history is configured. Reports may contain screenshots, URLs, page content, and diagnostics; use fictional data and keep any manually copied reports private.

**Native execution does not enforce outbound network isolation.** Local reports and disabled Lighthouse error reporting are not a sandbox or a guarantee about browser/dependency/host traffic. Normal dependency/browser installation may contact distributors.

Compare on the same machine under stable workloads and tool/browser/preset settings. Changes to hardware, architecture, tools, or measurement settings need explicit review/recalibration, not claims of equivalent cross-hardware performance. Host contention can still affect results.

## Verification

The real `*.vitals.spec.ts` specs are the acceptance seam, not a separate Docker or command-level wrapper suite. Vitest covers the public aggregation/budget helper in `tests/support/playwright/vitals-metrics.test.ts`, including medians, thresholds, and invalid/incomplete measurements.

For audit-tooling changes, require `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:coverage`, `pnpm test:e2e`, and default `pnpm test:vitals`. Ordinary E2E and report-only calibration do not substitute for the regression run. See the [testing guide](testing.md) for setup policy and test roles.

Initial verification on the baseline machine passed all six repository checks: 177 Vitest tests across 23 files (including nine measurement-helper tests), 95 ordinary E2E tests, and a subsequent default-budget vitals run with all ten page/device tests / 30 audits passing in 4.6 minutes. The generated Playwright report was checked for all 60 raw HTML/JSON files and suite overview attachments. Standards and specification reviews were completed; their findings were resolved.
