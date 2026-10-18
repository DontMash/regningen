# Licenses and notices

Original project code and documentation use **AGPL-3.0-only**, with the grant and exclusions in the README and the complete standard text in `LICENSE`. Third-party material retains its own terms. This inventory is notice preservation, not a certification of every redistribution or deployment obligation. In particular it does not implement corresponding-source delivery or a network source offer.

## Normal workflow

```bash
pnpm install --frozen-lockfile
pnpm notices:generate
pnpm notices:check
pnpm build
```

Development, typechecking and Vitest prepare the local notice data automatically. Lint checks the committed development inventory for staleness. No runtime or automatic build looks up legal information on the network. Install dependencies through the ordinary package-manager workflow first.

`src/lib/notices/generate.ts` is the single producer for the page dataset, `/third-party-notices.txt`, and `docs/development-licenses.json`. It reconciles `pnpm licenses list --json`, the current lockfile importer and transitive snapshots, and the actual installed dependency links. Residual installations outside the active graph are ignored. Relevant optional packages must be installed; packages excluded by this target's OS/CPU conditions are not claimed as audited. Multiple active versions keep separate identities and their complete legal texts.

Generated page data and public text are ignored build products. The development inventory is committed: regenerate it rather than editing it. It records declarations and local evidence hashes, including evidence limitations for tooling that does not contribute delivered software. It is not permission to redistribute a development container, native toolchain, or fonts included only in testing tools. Such distributions need their own source/relinking and subcomponent review.

## Release evidence

The ordinary build deliberately has two passes:

1. A **non-distributable discovery pass** records complete traversed module graphs and emitted asset provenance from both Vite environments and Nitro's final bundler. Tree shaking is not used to remove a traversed package's notices. The actual packaged server dependencies are inspected too.
2. The generator validates this target scope and its legal evidence, then creates one dataset and its text rendering.
3. A fresh release pass compiles that dataset into the application and precaches its local text resource. The final scope is checked again, after worker finalization. A discrepancy or failed legal check fails the command and removes `.output`; the discovery pass and a previous successful output are never fallbacks.

The final `.output` includes `LICENSE`, `THIRD-PARTY-NOTICES.txt`, and `licensing-artifacts.json`. The latter associates the notice revision and identities with SHA-256 hashes of the actual target files, including browser assets, the generated worker and server distribution. Ship these together; do not copy only a server entry point without its notices. The public text is also bundled with browser resources. These checks concern this Node/browser target, not arbitrary containers, native platforms or future deployment packaging.

`legal/runtime-scope.json` records package identities and contribution kinds from the last validated target solely to bootstrap development without two production builds. Release discovery never treats that list, manifest production/development classifications, or yesterday's build as shipment proof. Dependency versions and removals are always determined anew from the current locked installation. New emitted package and generated-runtime contributions must resolve to current license evidence.

## Reviewing a licensing failure

Diagnostics name the identity and missing/changed evidence. Do not bypass a failure by retaining generated output or approving every file in `node_modules`.

- Inspect the exact locked package, including bundled subdirectories, README grants, copyright/attribution resources, NOTICE files, assets and generated contributions. Package metadata alone is not the full grant.
- `legal/policy.json` is the reviewed policy: accepted expressions, exact approved legal-text SHA-256 fingerprints, and runtime-generator provenance rules. Fingerprints intentionally include copyright text: even a familiar SPDX label cannot authorize changed terms silently. Complete evidence sets bind all required grants and attributions to each reviewed identity; retaining an approved NOTICE cannot substitute for a missing primary grant (or vice versa). Known versions must match their exact reviewed sets; upgrades may reuse a complete, unchanged set already reviewed for the same package and license. Identical already-reviewed evidence can survive an ordinary version upgrade automatically; changed evidence returns for review. Fingerprints are not text substitutes; all operative texts are emitted.
- `legal/exceptions.json` is the small version-bound evidence/choice record. Each entry has an exact identity, reason, relevant source evidence hashes and any selected files or locally retained upstream text. Select an OR alternative explicitly; retain cumulative AND grants and complete applicable exception terms. An upgrade, changed pinned evidence, missing package or obsolete exception requires renewed review/removal.
- `legal/copied-source.json` covers imported source outside the package graph. Its original grant, attribution, provenance and source hashes remain reviewable. Review provenance when editing/replacing copied source; preserve upstream terms. Do not invent permission for unidentified material.
- Runtime producer rules document code emitted by build tools (including localization and worker software). New unfamiliar virtual runtime contributions fail instead of disappearing into the development inventory. Review their producer's grant and any bundled runtime subcomponents.
- Preserve fonts' supplied copyright, OFL conditions and Reserved Font Names. A wrapper package's permissive declaration is not evidence that bundled assets share those terms.

After review, update the precise evidence/approval, regenerate, build the real target, review the notice and inventory diff, and run all six checks in `AGENTS.md`. Avoid blanket exception patterns, volatile timestamps, absolute machine paths in notices, or hand-edited generated lists.

## Offline and updates

The Settings page uses the same local dataset as the text rendering. German and English explanatory copy is translated; upstream legal texts are not. Both localized SSR documents, legal text and their rendering assets participate in ordinary offline preparation. No visit to this page is required before preparation.

The dataset is compiled into content-hashed application chunks, so a notice-only change changes existing PWA document revisions and the generated worker even without a semantic-version bump. Workbox's existing revisioned precache retains the previous build's resources while its update is postponed, and installs the new resources through the normal acceptance/reload flow. There is no second updater or global activation veto. Successful preparation is still subject to browser storage eviction and the existing worker lifecycle.
