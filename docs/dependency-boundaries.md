# Dependency boundaries

Architectural boundaries are documentation and human review guidance. There is no
architecture analyzer, role registry, transitive-import checker, or replacement
ESLint rule. Passing `pnpm lint` does not establish architectural compliance.
Ordinary lint, formatting, TypeScript, and behavioral tests remain required.

The authoritative responsibility rules are in
[the coding standards](../CODING_STANDARDS.md#responsibilities-and-dependency-direction).
Review changes against them rather than maintaining a parallel executable model.

## Review responsibility and dependency direction

- **UI** consumes app-state data and operations. It owns presentation and local
  interaction state, not business validation, calculations, or service selection.
- **App-state** owns editable inputs, subscriptions, operation status, and
  localized feedback. It uses an injected domain interface, not concrete domain
  or service implementations. Presentation and state-management packages may be
  used directly for these responsibilities.
- **Domain** owns business interfaces, validation, invariants, calculations, and
  decisions. It remains package-independent and describes external capabilities
  through service contracts. Ordinary runtime facilities need no wrapper.
- **Services** translate package-specific data and failures behind those contracts.
  Structural backup decoding belongs here; domain validation remains authoritative.
- **Composition** selects concrete implementations and supplies capabilities.
  Neither UI nor app-state should select their own implementations.

Follow imports and re-exports when reviewing a boundary; a neutral helper name or
shared directory does not make a dependency independent. Shared code remains
feature-independent, and features collaborate through deliberately supported
interfaces. Do not reorganize modules just to produce one file per responsibility.

## Review observable contracts too

Import direction alone never established semantic correctness. In particular:

- Business Profile saves validate before persistence. Readiness distinguishes
  missing, incomplete, and unavailable data; editable incomplete inputs remain
  representable. The saved baseline is comparison data, not another draft owner.
- Invoice generation validates before rendering, excludes unfinished positions,
  and passes normalized data and domain-calculated totals to the PDF capability.
  Format failures and unexpected defects remain distinguishable with causes.
- Invoice Draft persistence, reset recovery, and release-note acknowledgment use
  supplied persistence capabilities. Composition selects browser adapters; their
  contracts retain cleanup and ordering without exposing package types.
- Localized field feedback translates domain outcomes rather than leaking schema
  package errors. Services preserve useful diagnostic causes behind their contracts.

Behavioral tests and judgment-based review complement one another. Neither a
passing test nor a passing type/lint check proves the whole architecture correct.
