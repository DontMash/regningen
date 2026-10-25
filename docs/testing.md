# Testing guide

This guide is the source of truth for test architecture and contribution. Package scripts and runner configuration remain the source of truth for commands and runner behavior.

## Test intent and scope

Classify tests by their boundary and purpose. Use Vitest for unit tests and module-level integration tests, including rendered-module tests. Use Playwright for browser-level integration/E2E journeys, including cross-feature workflows; keep Vitest rendering scoped to the module under test.

- **Unit tests** may focus on individual function calls or isolated modules, checking results, errors, branches, and relevant collaborator calls. These focused tests support the coverage gate and need not each describe a user journey.
- **Integration tests** must focus on user intent and feature requirements. Make the user's goal, relevant prerequisites or input variation, and selected observable outcomes clear from the test itself, without needing the originating spec to explain it. Exercise collaborating application parts at the chosen seam and assert the claimed outcome; internal-call assertions may support that proof but cannot replace it.
- **Supporting checks** for validation, accessibility, persistence, failure handling, navigation, layout, and appearance are legitimate when they protect a named user outcome. A focused integration test may cover a partial workflow rather than a complete journey.

Keep claims within the tested boundary. Test doubles outside the behavior being proved may support the chosen seam, subject to the setup rules below. For example, an intercepted download click proves initiation, not the downloaded artifact's filename or contents.

Review integration tests for intent clarity, behavioral proof, and alignment with current documented requirements and this guide. Where a feature requirement is undocumented, flag that limitation rather than claim complete requirements coverage.

## Test roles and locations

- **Scenarios** are runner-independent, deterministic user-input examples with test-owned types. Factories in `tests/scenarios/` return fresh data, accept focused overrides, and never run workflows, install state, or calculate application results. Keep invalid user input representable. Expected totals and artifact content are independently authored, not obtained from production code. The built-in Invoice PDF expectation assumes the built-in Business Profile scenario.
- **Robots** perform meaningful user-facing tasks and expose explicit checks. Put Playwright robots in `tests/robots/playwright/` and Testing Library robots in `tests/robots/vitest/`; share scenarios, not robot implementations or a forced common interface. Match each Playwright feature robot's filename, class, and fixture to its spec: for example, `app-shell.spec.ts` uses `app-shell.ts`, `AppShellRobot`, and `appShell`; `release-notes.spec.ts` uses `release-notes.ts`, `ReleaseNotesRobot`, and `releaseNotes`. Compose feature robots explicitly rather than exposing an umbrella application robot. Robots own UI selectors and interaction mechanics, including feature-owned accessibility checks. Provide focused tasks for incomplete input, validation timing, and cancellation as well as useful complete tasks. A task may wait for readiness but should not silently assert business outcomes.
- **Specs** compose journeys, configure prerequisites, and choose the outcomes to check. Keep executable E2E specs only in `tests/e2e/`; use one spec file per user-facing feature, such as app-shell, footer, theme, language, or release notes. App-shell owns routing and global appearance, typography, and motion behavior. Place cross-feature journeys in the spec for their primary user intent without duplicating them; split independent outcomes into separate focused tests. Keep UI selectors and locators out of specs. Specs may make direct assertions about returned values and artifacts.
- **Playwright fixtures** live in `tests/support/playwright/playwright.ts`. They construct robots bound to the test's page, without navigation, feature setup, data installation, or assertions. Keep standard per-test browser isolation; ordinary E2E journeys remain parallel, while the dedicated vitals suite measures sequentially.
- **Technical support** lives under `tests/support/`, separated by runner and organized by actual need. Playwright support belongs in `tests/support/playwright/`; Vitest support belongs in `tests/support/vitest/`. Keep environmental controls and technical inspection separate from feature robots. Browser controls such as secondary pages, viewport or system-theme changes, request observation, downloaded artifact handling, and layout measurements belong in Playwright support. Vitest tests may control storage faults, dispatch external storage events, intercept download initiation, and inspect persisted state directly or through support modules where reuse warrants them. Keep runner-independent input data in `tests/scenarios/`. Add a module when a test need exists; do not create speculative support layers.
- **Vitest support** owns rendering, router disposal, and explicit prerequisite installation. `saveBusinessProfile()` accepts test-owned scenario data; storage keys and serialization belong to this support seam, not shared scenarios or robots. The legacy `completeBusinessProfile` export supports unmigrated tests; migrated tests create fresh examples with the scenario factory.

## Setup policy

### Playwright

Ordinary feature setup crosses the user-facing browser interface. For example, an Invoice journey that requires a Business Profile configures that profile through its UI first; the Invoice robot never repairs or creates its prerequisite implicitly. Keep prerequisite feature setup visible in the spec.

Use browser-harness support only for conditions that ordinary UI actions cannot create or observe reliably, such as unavailable storage, a second tab, an operating-system preference change, outgoing-request observation, or downloaded artifact inspection. Configure real prerequisites through the UI before enabling a fault (for example, configure a Business Profile before making storage writes fail). Harness support controls the test environment; it is not a shortcut for installing normal feature data.

### Vitest

Tests own rendering, prerequisite installation, state resets, cleanup, and deliberate faults. Construct fresh feature robots with the test's `userEvent.setup()` instance; the robots query the current jsdom document and return no raw DOM handles. Construction performs no mounting, navigation, data installation, state reset, or assertions. Tasks operate through the rendered feature's UI without implicitly configuring prerequisites in another feature.

Configure dependencies outside the module under test explicitly through Vitest support. For example, an Invoice module test can install a Business Profile scenario with `saveBusinessProfile()` before rendering. The existing `renderAtRoute()` renders one real module with placeholder destination pages, so navigation checks prove the destination route was selected, not that another feature works. UI-to-storage-to-UI journeys across features belong in Playwright.

## Adding or changing an E2E journey

1. Keep the scenario's defaults complete and deterministic; override only the inputs relevant to the variation. Invoice dates and other user-entered values remain strings so invalid values can be tested.
2. Compose feature robots in the spec. Make cross-feature prerequisites explicit, including Business Profile setup before Invoice work.
3. Put new selectors, interaction mechanics, and feature-owned checks in the appropriate Playwright robot. Put exceptional browser controls, measurement, and artifact handling under `tests/support/playwright/` by need.
4. Make each spec state the journey and the outcomes it cares about. Do not hide business assertions in setup or robot tasks.
5. When input overrides change an expected calculation or PDF, supply the corresponding independently authored expected values too; an `expected.pdfText` override replaces the complete expected list. Do not import application schemas, calculations, serializers, storage code, or app-owned types into shared scenarios.
6. Keep every executable Playwright test in `tests/e2e/`, then run the relevant package test command and the repository-required verification commands before handoff.

## Adding or changing a Vitest module test

Business Profile and Invoice rendered-module suites use Vitest feature robots and shared scenarios. Shell, Home route, and focused unit/module suites retain their existing test interfaces; pure-function tests do not need robots.

1. Render the module and configure prerequisites explicitly at the existing seam. Keep reset/cleanup hooks visible in the suite.
2. Create fresh examples from `tests/scenarios/` and override inputs relevant to the behavior. Invalid and incomplete user input must remain representable; robot inputs use test-owned types rather than application draft types.
3. Compose meaningful robot tasks, including partial edits, blur/Enter actions, uploads, and separate confirmation or cancellation actions. Keep UI queries and interactions in the robot.
4. Invoke the feature checks that prove the test's claimed outcome explicitly. Keep expected totals independently authored and inspect returned values, persistence, or intercepted artifacts in the test. Download interception in jsdom does not prove a downloaded file's contents.
5. Preserve existing behavioral and accessibility assertions during a rework. Run the focused suite during development and the repository-required verification commands before handoff.

These conventions are enforced through guidance and review rather than a custom architecture linter.

## Native Lighthouse lab audits

`pnpm test:vitals` invokes Playwright with `playwright.vitals.config.ts`. Keep page-oriented specs in `tests/e2e/<page>.vitals.spec.ts`, excluded from ordinary `pnpm test:e2e`. Do not add a separate Docker/command-level acceptance suite or custom launcher.

The dedicated config's `webServer` makes a fresh full production build and serves it with matching build/runtime `ORIGIN=http://127.0.0.1:4173` and `TRUST_PROXY=false`. It replaces normal build outputs including `.output`; no repository snapshots or existing-server reuse. Dependencies/browsers are installed through ordinary project tooling, not downloaded inside tests. There is no preparation command.

Page-owned specs compose existing feature robots and fictional scenarios to prepare five representative pages through the UI: acknowledged home, populated Invoice with saved Business Profile, general settings, saved Business Profile editing, and licenses. Functional first-visit release-note coverage remains in the ordinary browser suite. Shared technical fixtures/support under `tests/support/playwright/` own the public Lighthouse Node API, Puppeteer CDP connection to the exact Playwright tab, cold-cache/worker controls retaining UI-created local/session storage, metric/budget handling, and report attachments. Keep normal PWA startup enabled and ordinary prerequisites visible in specs; no storage-seeding exception. Use German UI, light presentation, and Europe/Berlin timezone.

Run each page with actual Lighthouse mobile and desktop presets and three independent sequential measurements: 30 audits. All four categories are reported, but only per-page/device LCP/CLS/TBT medians gate against fixed committed budgets. Each audit caller explicitly supplies `expectedNoindex`; only `true` permits the intentional-private annotation. Public German and English introductions supply `false`, regardless of their non-root URLs. Expected private-page noindex is annotated without editing raw reports. Execution errors, missing measurements, and incomplete runs fail. These are lab measurements, not field INP or Core Web Vitals certification.

The real vitals specs are the browser acceptance seam. Vitest tests the public aggregation/budget helper in `tests/support/playwright/vitals-metrics.test.ts`: medians, budget boundaries/overruns, and invalid or incomplete inputs. Do not couple tests to private Lighthouse implementation calls. Playwright's standard HTML report contains untouched Lighthouse HTML/JSON attachments, using ignored generated directories and a latest-run lifecycle rather than an automatic archive. There is no custom cross-page reporter or second scenario registry; the selected page specs establish coverage.

For audit-tooling changes, require all six repository checks—`pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:coverage`, `pnpm test:e2e`—plus default `pnpm test:vitals`. Explicit `VITALS_CALIBRATE=1` runs are report-only for budgets and do not count as regression passes; operational failures still fail. Calibration requires three full runs on the current machine, variation review, and explicitly committed budgets before default regression acceptance. The initial native Linux baseline and reviewed budgets are documented in `docs/vitals.md`; other hardware/platforms are not calibrated.

See [native lab audits](vitals.md) for installation, the calibration formula, reports, and privacy/comparison limits. Reports stay local, Lighthouse error reporting is disabled, and no uploads are configured; native execution does **not** enforce outbound network isolation.

## Production PWA verification

PWA caching and update claims belong in the production-browser journey, not development-server mocks. The production harness builds isolated Nitro deployments, serves generated workers on one stable origin, and should assert the delivered manifest, generated artwork, worker headers and response integrity, offline startup and navigation to unvisited core screens in both languages, and actual downloaded PDFs. Judge preparation by working screens and artifacts, not generated worker URL lists or a particular revision algorithm. Exercise update postponement and acceptance through the generic application controls, including a same-SemVer content change; plugin callback doubles can cover local reload scheduling but do not prove worker installation or activation. Draft tests should describe per-tab session autosaving, ordinary reload restoration, reset ordering, and storage failures rather than the removed update-only snapshot protocol or coordinated cross-tab consent.
