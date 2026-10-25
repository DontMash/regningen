# Dependency boundaries

`pnpm lint` runs the dependency guardrail's executable examples and ESLint's
`architecture/dependency-boundaries` rule. No additional analysis framework or
runtime dependency is required. Run just the examples with
`node --test scripts/dependency-boundaries.test.mjs`.

## Declaring responsibility

`scripts/dependency-boundaries.mjs` declares the protected feature modules in
`applicationRoles`. Update that declaration when adding or moving these
responsibilities; a filename suffix does not establish a module's role.

- **domain**: package-independent business validation, position decisions,
  calculations, profile operations and generation operations.
- **contract**: domain data, interfaces and external capability contracts.
  Contracts are package-independent too, including type-only dependencies.
- **state**: editable state, subscriptions, operation status and localized
  feedback. React, TanStack and presentation tools remain permitted.
- **service**: concrete IBAN, profile/draft persistence, PDF/download and
  acknowledgment implementations. Package integration belongs here.
- **composition**: selects implementations and supplies capabilities. The router,
  root provider and explicitly listed feature composition modules have this role.
- **ui**: other production TSX modules render and coordinate interactions.

The declaration is intentionally not a list of every source file. Unclassified
helpers are traversed, not trusted as independent just because they live in
`lib`, use a neutral name, or re-export another module. Shared helpers must still
remain feature-independent under the coding standards.

## Mechanically enforced edges

Domain business modules and contracts cannot import external packages or
infrastructure/service, state, UI or composition modules. Contracts cannot import
concrete domain implementations either. Ordinary language
facilities such as `Date`, `Math` and collections need no wrapper. State cannot
import concrete business/service implementations or implementation-selecting
composition. UI cannot import concrete business/service implementations; it can
consume composed state operations. Both state and UI also reject the known
business/infrastructure packages `pdf-lib`, `ibantools`, `unstorage`, and `zod`,
including subpaths and unclassified helper re-exports. Presentation/date tooling
and state-management packages remain permitted. This bounded package list is not
a semantic classifier for every future dependency; extend it when integrating
another business capability. Composition can select implementations.

The rule examines static imports/re-exports, literal dynamic imports and
`require` calls, including helper chains and cycles. TypeScript resolves relative
and `@/` imports. Diagnostics show the importing role and dependency chain, then
point maintainers toward a supplied contract. Domain/contract traversal continues
through other domain/contracts, preventing a package re-export from laundering
package knowledge. Other declared boundaries are independently linted; a UI
consumer is not blamed for a composition module's legitimate service selection.

These are import checks, not proof of semantic ownership or a sandbox against
computed loading, global browser access, or runtime injection. Do not use those
mechanisms to bypass dependency direction. Tests are not assigned production
roles; this is not a test-architecture linter.

## Contract retirement and semantic review

Business validation now exposes `ValidationOutcome` and field failures from
`validation-contract.ts`, not Zod schemas/issues. `validation-feedback.ts` owns
localized presentation. The profile repository privately decodes structurally
supported backups; incomplete inputs remain editable. The old `business-profile`
and `invoice` schema adapters and locale-default amount parser are removed.
Amounts are interpreted by the business implementation using captured entry
language. Existing persistence/backup representations are unchanged.

Invoice Draft app-state accepts a persistence factory; recovery reuses it.
`invoice-draft.ts` is browser composition, not an optional raw-driver test adapter.
Tests needing another driver supply a capability at the app-state interface.
Reset generation has one feature-independent owner in
`lib/application-reset-generation.ts`, without the settings forwarding adapter.

Review of the affected contracts remains separate from passing imports:

- Profile saves validate before persistence; readiness distinguishes missing,
  incomplete and unavailable data. The saved baseline is comparison data, not a
  second Invoice Draft value owner.
- Invoice editing and generation use domain operations; generation validates
  before PDF rendering and never consumes the unfinished position. The PDF
  capability receives normalized data and domain-calculated totals. Format
  failures and unexpected defects remain distinguishable, with original causes.
- Profile decoding now retains JSON/structural diagnostic causes behind its
  contextual backup error while preserving localized messages and saved data.
- Draft reset recovery and release-note acknowledgment use supplied persistence;
  composition selects browser adapters. Their contracts retain cleanup and
  ordering responsibilities rather than exposing unstorage types.
- Typed field updates and byte-copying downloads need no impossible casts. The
  PDF encoder's message-based format limitation has concrete package evidence at
  its catch site. These checks do not certify unrelated assertions or full
  repository compliance.

The coordinated import-lifecycle/accessibility tickets and combined six gates
plus default-budget vitals run still require their own evidence. Import checks
do not replace those behavioral checks or judgment-based review.
