# Releasing

Production releases use a manually prepared PR, not a local tag or an ordinary push. See [deployment](deployment.md) for the image/webhook contract and the ordered operator setup, first-release, and recovery checklist at the end.

Before distributing dependency, copied-source, font or runtime-generator changes, review and update `public/third-party-notices.txt` manually; see [license and notices maintenance](licensing.md). Builds copy that text unchanged, without checking its legal completeness or freshness. Ship the complete `.output`, including its server and public assets and project license.

## Prepare and authorize a release

1. Merge source, feature, and workflow changes through ordinary PRs first.
2. Run **Prepare Release** (`.github/workflows/prepare-release.yml`) manually on current `main`. Select `auto`, `major`, `minor`, `patch`, or `version`; the last mode requires an explicit version.
3. Review the generated version, changelog, selected mode, and source SHA in the preparation PR. The repository-scoped release App creates or refreshes the single PR on `automation/release`. Its body stores preparation identity; there is no separately tracked release-metadata file.
4. Wait for current validation and required review. If `main` changes, manually run preparation again. Regeneration starts from fresh, unbumped `main`, recomputes notes/version, and replaces the candidate in the same PR. Do not merge newer `main` into an old candidate as a substitute, or hand-edit source into it. Updated candidates need new checks and review.
5. Merge the recognized preparation PR to authorize publication. There is no automatic merge or second deployment button.

Preparation uses native changelogen inference and overrides, with tagging and GitHub Release creation suppressed. It changes only generated release metadata and mechanically necessary package metadata; it publishes nothing. Empty or non-bumping commit ranges retain changelogen's native patch-bump behavior. A refresh can infer a larger bump when new commits warrant one.

A matching title, label, or branch name alone is not authorization. Automation verifies trusted App provenance, preparation identity, freshness, and expected generated changes. Do not repurpose the preparation branch for ordinary work.

## Validation and publication

- **Validate** (`.github/workflows/validate.yml`) checks ordinary PRs and pushes: formatting, lint, types, build, and unit/module coverage. Release-PR refreshes use this same lightweight gate, without installing or running Playwright.
- **Release** (`.github/workflows/release.yml`) acts only on a merged trusted preparation PR. It validates the exact merged SHA, including the full Chromium Playwright suite, before publication. It does not substitute a later `main`, accept arbitrary revision dispatches, or deploy ordinary merges, tags, or GitHub Release events.
- `scripts/release-cli.ts` coordinates `prepare`, `propose`, `check`, `authorize`, and `publish`. Workflows supply their trusted event/configuration context; these are not alternate arbitrary-source deployment entry points.

CI and containers pin Node **26.8.1** and pnpm **11.25.0**, with frozen dependency installation. Test execution denies non-loopback IPv4/IPv6 traffic, including spawned processes and test-owned servers. Setup downloads, image/GitHub operations, and the production observation are separate from isolated test execution. See [testing](testing.md).

After validation and container assembly, publication is ordered:

1. Publish the retained `ghcr.io/<owner>/<repo>:<version>` image (no `v` prefix) and verify anonymous availability.
2. Create permanent Git tag `v<version>` on the validated merged SHA and a GitHub Release containing generated changelog notes, version, merged SHA, versioned image reference, and registry digest.
3. Promote **that same digest**, without rebuilding, to mutable `ghcr.io/<owner>/<repo>:latest`.
4. Observe the public HTTPS `/healthz` endpoint for the exact built version and commit within a finite timeout.

New GHCR packages default to private. The first release may stop after publishing its validated versioned image, before `latest`. An operator must make the package public and rerun the failed release workflow, preserving its identity. Missing configuration, failed checks/publication, private images, and conflicting artifact identities block promotion.

Release attempts are serialized through final observation, without automatically cancelling an in-flight attempt. Version tags/images are never replaced with different content by this workflow. Reruns reuse matching artifacts and reject conflicts rather than moving tags or inventing another version.

## Artifacts are not deployment success

A **release artifact** is the retained image, permanent Git tag, and GitHub Release record. A **production deployment attempt** starts when `latest` signals Dokploy through the registry webhook. A **successful health observation** means the expected server build responded over HTTPS; it does not prove every replica completed rollout, feature correctness, certificate renewal, or ongoing availability.

Validation failures publish nothing. Later failures may leave partial artifacts. A failed health observation occurs after signaling deployment and cannot undo that signal. Keep the workflow failed and preserve published evidence: no automatic rollback, deletion, or `latest` rewind occurs.

For infrastructure recovery, rerun the failed Release workflow for the same authorized merge; do not rerun preparation/changelogen just to retry. If deployment needs replay, redeliver the existing registry webhook or explicitly redeploy the same validated image in Dokploy. A no-op registry push is not a guaranteed new delivery. Historical rollback uses a retained versioned image, not moving `latest`; follow the [operator recovery checklist](deployment.md#operator-checklist-setup-first-release-and-recovery).

## Local release tool

The existing local tool remains available from a clean working tree:

```bash
pnpm release
pnpm release --major
pnpm release --minor
pnpm release --patch
pnpm release -r 2.4.0
```

This runs `changelogen --release --clean --no-github` directly. It updates `package.json` and `CHANGELOG.md`, preserves older entries, and creates a local release commit and `v<version>` tag. `--clean` rejects a dirty tree; an empty or non-bumping range defaults to a patch bump. Review the commit range.

The command does not push, publish a remote release/image, or deploy. Local tags and direct pushes are not the normal production path; use the preparation PR flow above rather than pushing a provisional tag that could conflict with the permanent merged-release identity.

## Bundled release data

The package manifest and generated changelog remain the runtime version and release-note sources. The build validates that the manifest version has a matching latest changelog entry before bundling release data. Built commit metadata identifies the artifact; it is not another editable version or release-note source.
