# Coding standards

This document records judgment calls for design, implementation, and review. It defines the intended standard, not a claim that existing code already conforms. Repository-wide compliance analysis and remediation are separate work.

**Must** marks a requirement. **Prefer** marks a default that may be departed from with a concrete rationale recorded where maintainers will encounter the decision. Revisiting a must requires an explicit change to the standard, not an implicit exception in code. Existing code is not, by itself, justification for a deviation.

## Judgment and guardrails

Executable configuration is authoritative for mechanical conventions. Consult the formatter, linter, type checker, package scripts, and runner configuration rather than restating their settings here. Do not introduce stylistic restrictions solely for uniformity.

A check can fail; a sentence in Markdown cannot. Reliably machine-checkable rules belong in executable guardrails. This document explains the judgment those checks cannot establish; it does not replace enforcement. Within a review's agreed scope, missing guardrails are findings of their own, separate from violations in application code. Passing checks is not proof that the design satisfies these standards.

## Responsibilities and dependency direction

The behavioral flow is:

```text
UI → app-state → domain → services → dependencies/packages
```

This describes responsibilities, not a requirement for one class, file, or forwarding function per layer. Package isolation applies to business capabilities, not to presentation or state-management tooling.

### UI

- UI must consume app-state's data and operations rather than independently derive business meaning or invoke domain services.
- UI owns presentation and purely local interaction state, such as disclosure or selection visibility. Business decisions and domain-derived state belong outside UI components.
- Prefer routes focused on navigation and feature composition; business behavior belongs in the domain.

### App-state

App-state is the UI-facing representation of domain data, editable working state, and operation status. It is a responsibility, not a particular store or package.

- App-state must use an injected domain implementation through the domain interface. It must not select, construct, or depend on that concrete implementation or its service implementations.
- App-state owns subscriptions and the translation of domain outcomes into UI-facing loading, error, and pending-change states. It must not duplicate domain rules.
- Framework and state-management tools may be used directly for these responsibilities, provided they do not expose concrete implementations of domain operations.

### Domain

- The domain owns both its interface and the business implementation that satisfies it: calculations, business validation, invariants, and business decisions.
- The domain must express that behavior without directly depending on external packages or infrastructure. It uses service contracts for external capabilities; ordinary language/runtime facilities do not require service wrappers.
- The domain interface must expose meaningful operations and data while hiding implementation mechanisms. Its contract includes relevant invariants, failure modes, and ordering constraints, not merely type signatures.

### Services and composition

- The domain describes the capabilities it needs through service contracts. Service implementations satisfy those contracts using external tools, dependencies, or packages.
- Services must translate package-specific data and failures into the contract's language rather than leak package types or errors to domain callers.
- A separate composition location must select concrete domain and service implementations and supply their dependencies. UI and app-state must not perform that selection.

## Feature ownership and module design

- Feature-specific behavior belongs with its feature. Shared code must remain independent of features; moving code into a shared location is not a way to bypass feature ownership.
- Features may collaborate through deliberately supported interfaces, not through another feature's internal files. Public barrel files are not required.
- Prefer modules that hide meaningful complexity behind a small interface. Keep related behavior and knowledge together so a change does not require callers to coordinate implementation details.
- Prefer abstractions justified by actual variation or meaningful complexity. Avoid speculative reuse and pass-through layers that add no responsibility. A small service implementation can still earn its place by isolating a package at the agreed interface.
- Use the established vocabulary consistently for the same concept; introduce a different name only for a genuinely different concept. Consult the [glossary](GLOSSARY.md) and [domain documentation guidance](docs/agents/domain.md).

## State, validation, and effects

### Ownership and validity

- Each piece of state must have one authoritative owner. Prefer deriving values from that owner rather than independently storing and synchronizing equivalent values.
- Incomplete or invalid editing state must remain representable without pretending it is valid domain data. App-state manages UI-facing working state; the domain determines business meaning and validity.
- Services must validate external representations before exposing them through their contracts. Structural decoding and domain validation have different responsibilities: the domain remains authoritative for business invariants.
- UI validation provides timely feedback; it must not be the sole protection for a domain operation.

### Failures and asynchronous work

- Interfaces must distinguish expected operational failures from programming defects, preserve useful diagnostic context, and give callers enough information to choose a meaningful response.
- A fallback must not conceal failure by making an unsuccessful operation appear successful. A universal result type or exception strategy is not required.
- Asynchronous work must have a deliberate lifecycle: pending and failure states, resource cleanup, and behavior when inputs change or an older operation completes late.
- Choose cancellation, sequencing, or stale-result rejection according to the operation's semantics. Do not impose one concurrency policy on unrelated operations.

## Type-safety judgment

Prefer narrowing and explicit contracts over escape hatches. Where an unsafe assertion, non-null assertion, `any`, or suppression remains necessary, its justification must identify the evidence or external constraint that makes it acceptable. A generic claim that the value is safe is not sufficient.

## UI quality

- Prefer established components and design conventions over recreating equivalent controls or introducing isolated visual rules.
- UI design must account for keyboard interaction, focus movement and restoration, accessible feedback, responsive layout, and localization, including non-success states.
- Distinguish presentation choices from business decisions. Reusing a component or passing an automated accessibility check does not by itself establish an understandable, usable interaction.

Translation contribution details remain in the [language guidance](README.md#languages); mechanical component conventions belong in tooling where reliable enforcement is possible.

## Dependency and feature evolution

Before adding or replacing a dependency, weigh existing capabilities, interface fit, meaningful complexity removed, runtime cost, maintenance health, licensing, and the maintenance burden over the feature's lifetime. Consider foreseeable future feature requirements as well as the immediate implementation; reducing today's line count is not sufficient justification.

Prefer a choice that keeps likely evolution local without introducing abstractions for hypothetical requirements. Dependencies implementing business capabilities remain behind service contracts. Follow the [license and notices guidance](docs/licensing.md) for accompanying obligations.

## Related authorities

Keep detailed policies in their existing authoritative documents rather than duplicating them here:

- [Testing](docs/testing.md): test intent, scope, contribution, and support architecture.
- [Security](docs/security.md): policy ownership and browser/deployment security.
- [Configuration](docs/configuration.md): environment inputs and validation.
- [Domain documentation](docs/agents/domain.md): vocabulary and architectural decisions.
- [Licensing](docs/licensing.md): dependency and imported-material obligations.

The required verification workflow remains in [AGENTS.md](AGENTS.md). Changes to judgment-based guidance do not imply that new automated enforcement has been implemented.
