# Production deployment

The [release workflow](releasing.md) publishes a public GHCR image. Dokploy pulls and redeploys it through Docker Provider Auto Deploy after a GitHub registry-package webhook. Actions does not call Dokploy, install a Dokploy client, or hold a Dokploy credential/webhook URL. Ordinary source pushes, tags, and PR merges must not independently deploy this application.

This guide describes repository delivery and operator-owned setup, not changes already applied to a live installation. Do not register credentials, publish a real release, or deploy as part of implementing repository changes.

## Image and server contract

- Normal target: `ghcr.io/<owner>/<repo>:latest`, using the lowercase repository image name. Retained recovery target: `ghcr.io/<owner>/<repo>:<version>` without a `v` prefix. Record its `sha256:` digest from the GitHub Release. `latest` is mutable, not a historical identity.
- The container ships the complete Node/Nitro `.output`, including server/public assets, `LICENSE`, and maintained third-party notices. Node 26.8.1 and pnpm 11.25.0 are pinned for the delivery toolchain. Notices still require [manual review](licensing.md).
- Route the reverse proxy to the container's Node listener, not a development server. Confirm the delivered Dockerfile's bind address/port when configuring the service; Nitro listener inputs are documented in [configuration](configuration.md#framework-and-tooling-controls).
- Supply matching effective `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` at build and runtime. Actions variable `PRODUCTION_ORIGIN` supplies the release build's origin and HTTPS observation target. Configure the corresponding runtime `ORIGIN` explicitly in Dokploy. The separate runtime process does not inherit build settings.
- Preserve [proxy sanitization, backend protection, HTTPS and HSTS rollout](security.md). Start with HSTS off; deploying this pipeline does not verify certificates/renewal or authorize HSTS promotion. A runtime-only policy change does not update prepared offline documents; rebuild as documented in [configuration](configuration.md#matching-build-and-runtime-settings).

## Registry-originated deployment

Connect the GHCR package to its publishing repository. Matching image/repository names alone do not create that association. Only the trusted release publisher normally writes `latest`; the preparation App and ordinary validation jobs must not have package-publishing permissions. Public images permit anonymous Dokploy pulls, so no long-lived registry pull credential is needed.

In GitHub repository webhook settings, deliver JSON **`registry_package`** events (Registry packages) directly to Dokploy's generated HTTPS deployment URL. Subscribe only to that event for this application, not Git pushes, GitHub Releases, or all events. Enable Auto Deploy and configure Docker Provider with the full application's `latest` image reference.

The [Dokploy v0.31.0 handler](https://github.com/Dokploy/dokploy/blob/v0.31.0/apps/dokploy/pages/api/deploy/%5BrefreshToken%5D.ts) is the verified source baseline, not a minimum-version claim or evidence of the installed version. For recognized registry-package payloads it compares the configured image and tag, skips untagged manifests, and rejects mismatched tags. It requires Auto Deploy. It also retains a legacy fallback when image information is absent: subscription and controlled payload checks matter; this is not a claim that all arbitrary payloads are strictly authenticated and filtered.

That handler authenticates the application using the generated URL token; it does **not** verify GitHub HMAC signature headers. Treat the complete webhook URL as a secret capability, store it only in administrator-controlled webhook settings, and protect it from logs, source, PRs, and Actions configuration. Setting GitHub's optional webhook Secret does not add signature verification to a handler that does not implement it.

Verify equivalent behavior on the actual installed Dokploy version and inspect real deliveries before relying on Auto Deploy. Webhooks can be delayed or duplicated; untagged/multiarch manifests are not necessarily complete release events. Do not claim exactly-once deployment or guaranteed delivery from a no-op re-push. Unsupported integration requires an explicit platform decision, not a hidden Actions-to-Dokploy fallback.

## Health observation and failure evidence

After `latest` promotion, Actions makes up to 60 bounded HTTPS requests to `PRODUCTION_ORIGIN` at `/healthz`, with a 5-second request timeout and 10 seconds between attempts. The uncached JSON response identifies the artifact's built version and source commit. An old build returning HTTP success is not success: both identities must match. Runtime declarations cannot relabel an old artifact. The endpoint exposes no environment dump or user data and retains the application's response-security policy.

Transport/TLS errors, malformed responses, mismatches, and timeout leave the release failed with diagnostic evidence. Actions does not poll Dokploy tasks or run integration/browser suites against production. Observation proves that the expected server build responds, not every replica's state or comprehensive deployment security.

Failures before promotion must not advance `latest`. A post-promotion health failure cannot prevent an already signaled attempt. Published images, tags, and release notes remain available; there is no automatic rollback or rewind. Rerunning the failed release workflow recovers the same authorized release, with artifact identity checks, not a new changelogen bump or arbitrary source dispatch.

## Platform evidence

These references were checked while preparing this guide; installed-platform delivery remains manual acceptance:

- [GitHub webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads#registry_package) and [creating webhooks](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks): registry notifications, event selection, JSON delivery, and optional signature headers.
- [GHCR publication and linkage](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry): default private visibility, anonymous public pulls, workflow-token publication, repository linkage, and digest references.
- [Dokploy v0.31.0 source](https://github.com/Dokploy/dokploy/blob/v0.31.0/apps/dokploy/pages/api/deploy/%5BrefreshToken%5D.ts): version-specific registry parsing, filtering, Auto Deploy and URL-token behavior. [Going production](https://docs.dokploy.com/docs/core/applications/going-production) is general guidance, not proof that another installed version handles GHCR identically.
- [Dokploy rollbacks](https://docs.dokploy.com/docs/core/applications/rollbacks): registry-backed history guidance does not establish that externally published `latest` retains a snapshot of its former digest. Use retained versioned images regardless of optional native history features.

## Operator checklist: setup, first release, and recovery

Perform these steps in order after repository implementation; they are not automated infrastructure changes.

1. **Install without deploying.** Review `.github/workflows/validate.yml`, `prepare-release.yml`, `release.yml`, `scripts/release-cli.ts`, the Dockerfile, and the pinned Node 26.8.1/pnpm 11.25.0 toolchain. Confirm actual check names and listener settings before configuring them.
2. **Create the preparation App.** Install only on this repository with Contents and Pull requests read/write, no administration, protection bypass, or package publishing. Set Actions variables `RELEASE_APP_ID` and `RELEASE_APP_LOGIN` (the actual bot login, e.g. `app-slug[bot]`), and secret `RELEASE_APP_PRIVATE_KEY`. Restrict secret-bearing preparation to trusted `main` execution.
3. **Protect `main`.** Require PRs and the actual lightweight Validate checks, require up-to-date candidates, dismiss stale approvals and require fresh checks/review after regeneration. The App must not bypass protection. Do not require a Playwright PR check that routine validation intentionally never produces.
4. **Constrain publication.** Keep default workflow permissions read-only. Grant publishing only to trusted release jobs; remove other routine `latest` writers. Verify package/repository linkage and the publisher's package access, including any pre-existing package.
5. **Set deployment inputs.** Set Actions variables `PRODUCTION_ORIGIN` to the intended bare HTTPS origin, `TRUST_PROXY` to the intended explicit boolean, and `HSTS_STAGE` initially to `off`. Supply matching runtime `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` in Dokploy. Complete the [public HTTPS checklist](security.md#public-https-deployment-checklist), including forwarding-header overwrite, protected backend, certificate renewal, and HTTP redirect checks. Do not enable proxy trust or promote HSTS on assumptions.
6. **Configure Dokploy.** Check the installed version against the v0.31.0 handler behavior. Choose Docker Provider, configure `ghcr.io/<owner>/<repo>:latest`, the container listener/port, and Auto Deploy. Disable branch builds, source push triggers, and independent production deployers. Do not substitute an undocumented workflow deployment request if registry integration is unsupported.
7. **Configure the webhook.** Put Dokploy's generated HTTPS URL only in administrator-controlled repository webhook settings; choose JSON and Registry packages (`registry_package`) only. Protect its URL token; do not assume the optional Secret is verified. Confirm the package is associated with the repository and inspect delivery payloads/responses.
8. **Prepare the controlled first release.** Run Prepare Release on current `main`, review its version, notes, source SHA, mode, and generated-only changes, then merge after current checks/review. Watch Release validate the exact merged SHA before publishing.
9. **Handle first-package visibility before promotion.** If GHCR is new/private, the release stops after validated versioned-image publication. Set the package public, confirm anonymous access, and rerun the failed Release workflow for the same merge. Do not create a new version or manually promote `latest` to bypass the gate.
10. **Accept the installed integration.** Confirm version-tag/untagged events do not deploy and a matching `latest` event does. Inspect actual deliveries, full image/tag matching, fresh pulling, and final HTTPS `/healthz` identity. Check recorded release digest against version and `latest`. This controlled delivery check is not a production browser/integration suite.
11. **Recover the same release if needed.** Preserve failed-run logs and all published artifacts. Fix the diagnosed configuration/infrastructure fault, then rerun the failed Release workflow; do not move Git tags, replace versioned images, or bump merely to retry. If delivery needs replay, explicitly redeliver the existing matching registry webhook or redeploy the same validated image in Dokploy. Do not rely on a no-op push to emit another event.
12. **Roll back and re-arm deliberately.** Retain versioned images/digests. In Dokploy choose a previous validated versioned image and redeploy; verify its built version/commit over HTTPS. Do not use mutable `latest` as a historical target or assume native history snapshots its prior digest. Pinning an older version can prevent subsequent `latest` events matching. Before the next intended release signal, deliberately restore `latest` configuration without accidentally deploying the failed image currently behind it; coordinate that transition with the next authorized release. Recheck health and matching before resuming normal releases.
