# Testing guide

This guide is the source of truth for test architecture and contribution. Package scripts and runner configuration remain the source of truth for commands and runner behavior.

## Test intent and scope

Classify tests by their boundary and purpose, not their runner. Vitest includes both unit tests and rendered-module integration tests; Playwright exercises browser-level integration/E2E journeys.

- **Unit tests** may focus on individual function calls or isolated modules, checking results, errors, branches, and relevant collaborator calls. These focused tests support the coverage gate and need not each describe a user journey.
- **Integration tests** must focus on user intent and feature requirements. Make the user's goal, relevant prerequisites or input variation, and selected observable outcomes clear from the test itself, without needing the originating spec to explain it. Exercise collaborating application parts at the chosen seam and assert the claimed outcome; internal-call assertions may support that proof but cannot replace it.
- **Supporting checks** for validation, accessibility, persistence, failure handling, navigation, layout, and appearance are legitimate when they protect a named user outcome. A focused integration test may cover a partial workflow rather than a complete journey.

Keep claims within the tested boundary. Test doubles outside the behavior being proved may support the chosen seam, subject to the setup rules below. For example, an intercepted download click proves initiation, not the downloaded artifact's filename or contents.

Review integration tests for intent clarity, behavioral proof, and alignment with current documented requirements and this guide. Where a feature requirement is undocumented, flag that limitation rather than claim complete requirements coverage.

## Test roles and locations

- **Scenarios** are runner-independent, deterministic user-input examples with test-owned types. Factories in `tests/scenarios/` return fresh data, accept focused overrides, and never run workflows, install state, or calculate application results. Keep invalid user input representable. Expected totals and artifact content are independently authored, not obtained from production code. The built-in Invoice PDF expectation assumes the built-in Business Profile scenario.
- **Robots** perform meaningful user-facing tasks and expose explicit checks. Put Playwright robots in `tests/robots/playwright/`; keep selectors and interaction mechanics there. A task may wait for readiness but should not silently assert unrelated outcomes.
- **Specs** compose journeys, configure prerequisites, and choose the outcomes to check. Keep executable E2E specs only in `tests/e2e/`; keep UI selectors and locators out of them. Specs may make direct assertions about returned values and artifacts.
- **Playwright fixtures** live in `tests/support/playwright/playwright.ts`. They construct robots bound to the test's page, without navigation, feature setup, data installation, or assertions. Keep the standard per-test browser isolation and parallel execution.
- **Technical support** lives under `tests/support/`, separated by runner and organized by actual need. Playwright support belongs in `tests/support/playwright/`; Vitest support belongs in `tests/support/vitest/`. Keep deliberate browser controls and exceptional mechanics separate from feature robots: storage faults, secondary pages, viewport or system-theme changes, request observation, download/PDF handling, and layout or style measurements belong in Playwright support. Keep runner-independent input data in `tests/scenarios/`. Add a module when a test need exists; do not create speculative support layers.
- **Vitest support** lives in `tests/support/vitest/`. Existing rendering, router cleanup, and Business Profile storage setup retain their current seams. These modules are not Playwright support or robots, and this directory reorganization does not change existing Vitest test behavior.

## Setup policy

Ordinary feature setup crosses the user-facing browser interface. For example, an Invoice journey that requires a Business Profile configures that profile through its UI first; the Invoice robot never repairs or creates its prerequisite implicitly. Keep prerequisite feature setup visible in the spec.

Use browser-harness support only for conditions that ordinary UI actions cannot create or observe reliably, such as unavailable storage, a second tab, an operating-system preference change, outgoing-request observation, or downloaded artifact inspection. Configure real prerequisites through the UI before enabling a fault (for example, configure a Business Profile before making storage writes fail). Harness support controls the test environment; it is not a shortcut for installing normal feature data.

## Adding or changing an E2E journey

1. Keep the scenario's defaults complete and deterministic; override only the inputs relevant to the variation. Invoice dates and other user-entered values remain strings so invalid values can be tested.
2. Compose feature robots in the spec. Make cross-feature prerequisites explicit, including Business Profile setup before Invoice work.
3. Put new selectors, interaction mechanics, and feature-owned checks in the appropriate Playwright robot. Put exceptional browser controls, measurement, and artifact handling under `tests/support/playwright/` by need.
4. Make each spec state the journey and the outcomes it cares about. Do not hide business assertions in setup or robot tasks.
5. When input overrides change an expected calculation or PDF, supply the corresponding independently authored expected values too; an `expected.pdfText` override replaces the complete expected list. Do not import application schemas, calculations, serializers, storage code, or app-owned types into shared scenarios.
6. Keep every executable Playwright test in `tests/e2e/`, then run the relevant package test command and the repository-required verification commands before handoff.

## Vitest reuse and future robots

Vitest may import `tests/scenarios/` directly; scenario factories have no runner dependency. Pure-function tests do not need robots. Existing Vitest tests are not being migrated by the E2E refactor.

If a future rendered-component test benefits from a robot, implement a separate Testing Library version under `tests/robots/vitest/`. It can encapsulate `screen` queries, `userEvent`, and explicit assertions at the rendered module's chosen seam. Keep it runner-specific rather than sharing Playwright interaction code or requiring both robot implementations to have identical interfaces. Decide Vitest migration scope, rendering ownership, cleanup, and prerequisite policy separately before changing existing tests. No Vitest robot directory is needed until that work exists.
