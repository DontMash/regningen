# regningen

A German and English invoice generator application built with React, TanStack Start, Paraglide, and Tailwind CSS.

## Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The app is available at <http://localhost:3000>. No environment file is required. Optionally copy `.env.example` to `.env.local`; the safe defaults leave public identity, proxy trust, and HSTS disabled. See [environment configuration](docs/configuration.md) for supported settings, validation, file precedence, and mode selection.

See the [testing guide](docs/testing.md) for test architecture and contribution conventions, the [release guide](docs/releasing.md) for preparing a local release, and the [license and notices guide](docs/licensing.md) for manually maintaining accompanying third-party notices.

## Checks

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm build
pnpm test:coverage
pnpm test:e2e
```

Unit and module-level integration tests use Vitest (`pnpm test` for a run without coverage). Browser-level integration tests use Playwright with Chromium; install it through normal project tooling before testing:

```bash
pnpm exec playwright install chromium
```

Lighthouse lab audits use a separate Playwright suite, excluded from ordinary E2E:

```bash
pnpm test:vitals
```

The design uses a fresh full production build in place (replacing `.output`), five UI-prepared pages, actual mobile/desktop Lighthouse presets, and three sequential measurements each: 30 audits. Default runs gate LCP/CLS/TBT medians against committed calibrated budgets; all four categories remain in local Playwright reports. No Docker, preparation command, or hidden test downloads are involved. Local execution does **not** enforce outbound network isolation or certify field INP/Core Web Vitals. See [native lab audits](docs/vitals.md) for installation, calibration-only mode, latest-run reports, privacy limits, and same-machine comparison guidance.

## Production

Build with `pnpm build`, then preview with `pnpm preview` at <http://127.0.0.1:4173>. Preview runs the built Node server with production HTTP/security behavior, loads the selected mode's local environment files, and fails if its requested port is unavailable. It supports `--host HOST`, `--port PORT`, and `--mode MODE`.

For deployment, run `node .output/server/index.mjs` with host-injected configuration, or explicitly load a file with `node --env-file=/path/to/file .output/server/index.mjs`. Direct Node startup loads no environment files automatically, and a separate server invocation does not inherit values loaded by the build. Use matching effective `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` at build and runtime; configuration changes require rebuilding and restarting for PWA document revisions. See [environment configuration](docs/configuration.md) for accepted values, safe defaults, startup failures, and production examples.

An absent or empty `ORIGIN` leaves the deployment noindex with no public identity; a foreign preview origin also remains noindex. See [public visibility and deployment](docs/visibility.md) for explicit `TRUST_PROXY` opt-in, proxy sanitization, cache isolation, discovery endpoints, and offline metadata updates.

Production and production-style previews enforce repository-owned browser security headers. HSTS is **off by default** until public HTTPS, redirection, and automated renewal are verified. See [browser security and the HTTPS deployment checklist](docs/security.md) for policy ownership, CSP/offline behavior, explicit HSTS rollout/rollback, and hosting responsibilities. Local tests do not verify the public deployment.

## Languages

Use the language icon in the header, or the interface-language select in General Settings, to choose **Deutsch** or **English**. Public pages have translated addresses: `/de` / `/en`, `/de/rechnung` / `/en/invoice`, `/de/einstellungen` / `/en/settings`, and `/de/einstellungen/profil` / `/en/settings/profile`. An explicit URL language wins; unprefixed entry uses the remembered cookie, browser preference, then German. English uses en-GB formatting and German uses de-DE; both retain EUR and the existing German-oriented invoicing rules.

**Invoice Language** is configured only in General Settings. It defaults to **Follow interface language**; fixed Deutsch or English stays fixed across later interface changes. The resolved choice controls PDF wording, formatting, metadata, and filename, not the language of editor feedback. User-entered content is never translated. Switching interface language preserves the tab's Invoice Draft and amount interpretation, and asks before discarding unsaved Business Profile changes.

Translations are individual messages in `messages/de/` and `messages/en/`, with typed placeholders and plural variants. Add matching keys in both languages; compiler configuration merges the feature catalogs. `pnpm i18n:compile` generates the ignored Paraglide output. Development/build and the normal lint, typecheck, and Vitest package scripts compile it automatically; run the compiler first when invoking tools directly after a fresh checkout. Do not edit or commit generated runtime/messages.

## Settings

Open **Einstellungen / Settings** using the cogwheel in the header. The settings aside links to **Allgemein / General**, **Profil / Profile**, and **Lizenz / License** at their localized addresses. The project-license page lives at `/de/einstellungen/lizenzen` or `/en/settings/licenses` and displays the complete project license with explanations of its scope. Third-party materials retain their own terms; their accompanying plain-text notices are served separately at `/third-party-notices.txt` and are not catalogued or linked from Settings. General Settings contains language, appearance, local PDF notifications, and application reset. The header theme shortcut remains synchronized with the System/Light/Dark selection.

Profil contains the Business Profile form and backup/delete controls. Editing and importing change only the working form: choose **Profil speichern** to persist a valid profile. Save stays on Profil; **Rechnung** returns to invoicing without discarding the tab's Invoice Draft. Leaving with unsaved profile changes offers a discard warning; manual tab close/reload uses the browser's best-effort native warning. Ordinary saves in multiple tabs silently use the last successful save, without conflict warnings or merging.

## Installable app and offline use

Production builds use `vite-plugin-pwa` to generate the manifest, receipt-derived installation artwork, and a Workbox service worker. The worker precaches the unprefixed entry and both languages' introduction, Invoice, General Settings, Profile, and project-license documents, the local plain-text notices resource, plus application chunks, fonts, styles, localized manifests, and generated icons. Both languages use one app identity and installation. Production hosting must serve the app and `/sw.js` over HTTPS (localhost is suitable for testing), keep the worker URL and `/` scope stable, and avoid caching `/sw.js`. The current deployment supports the root path; hosting under a subdirectory is not verified. `pnpm test:e2e` builds and serves isolated production deployments to exercise real offline routing, PDF generation, and prompt-managed updates.

Visit online once and wait for **Offline bereit** before relying on offline startup. The generated worker prepares the core server-rendered routes, lazy-loaded assets, fonts, styles, and icons. Browser storage can still be evicted, and installation does not guarantee permanent offline access. Installation and Add to Home Screen are managed by the browser's own interfaces; support varies by browser and platform. Installation does not enable PDF notifications.

New content is downloaded in the background. When it is ready, **Update verfügbar** offers **Update jetzt** and **Später**; postponing or dismissing leaves the update discoverable in the footer. The notice does not preview incoming release notes. Accepting an update does not acknowledge or suppress notes for an incoming release; after reload, the existing release-note acknowledgment rules apply. This migration also removes strict validation that an old page and newly activated worker belong to a compatible release. Updates use the plugin's standard worker lifecycle: the application does not coordinate consent or preparation across tabs, and a browser may activate a waiting worker after old clients close. The application delays its own reload while a local PDF or Business Profile write is active. Unsaved profile changes require explicit discard before this tab requests an update and again before a plugin-requested reload if new changes exist. Canceling keeps the current document and edits; a deferred reload remains accessible through the footer update control. This is not a veto over worker activation, including activation requested by another tab.

The complete editable Invoice Draft is autosaved in each tab's `sessionStorage`, including incomplete and invalid values and an unsubmitted Invoice Position. It restores automatically after ordinary reloads and plugin-managed updates, and remains after PDF export. Confirming **Neue Rechnung** clears it before resetting the form. Browser session storage is temporary: it is not an archive or a guarantee of recovery after tab closure, crashes, process termination, eviction, or clearing site data. Tabs do not synchronize their drafts, though a tab opened from another may initially inherit a copy according to browser session behavior. A native unload warning is shown while Invoice Draft changes have not persisted or Business Profile edits remain unsaved; browsers control its wording and reliability.

PDF notifications are optional and separately enabled after installation/permission where the platform requires it. They identify the downloaded filename only; the PDF remains in browser/OS Downloads and must be opened there. Notifications do not upload invoice data, retain a PDF copy, or guarantee OS delivery.

### Manual platform checks

Headless tests verify application handling, not actual OS installation or notification display. Before deploying, check Chromium desktop/Android and Safari macOS/iOS/iPadOS on HTTPS: install through the browser's own interfaces, cancel without losing work, verify receipt artwork and maskable cropping, launch standalone, and launch the Invoice workflow offline after preparation. On supported platforms, enable notifications separately, export a PDF, verify the filename and Downloads guidance, then deny/revoke permission and disable notifications to confirm downloads still work. On iOS/iPadOS, check the Home Screen prerequisite. These device checks are not automated by the repository.

## Local data and invoices

The app server delivers server-rendered documents and application assets; it does not receive Business Profile or Invoice content. Business Profile data stays in the current browser's local storage. Invoice Drafts use TanStack Store as working state and unstorage's session-storage driver for per-tab autosaving. The PDF is generated locally and downloaded through the browser. Clearing site data removes the Business Profile and may remove other browser-managed application data.

The profile can be exported and imported as JSON. Export includes only the last saved profile, not unsaved edits; imported values require a later valid **Profil speichern** action. Structurally supported incomplete backups remain editable. Backups are **not encrypted** and contain sensitive business information, so store them securely. Export a backup before clearing browser data or moving to another browser or device.

**Profil löschen** removes only the saved Business Profile and clears its working form; Invoice Drafts and general preferences remain. **Anwendung zurücksetzen** instead removes the Business Profile, Invoice Drafts and unfinished Positions, appearance, language and notification preferences, and release-note acknowledgments. Its confirmation applies to all reset-aware application tabs sharing this browser's site storage, including stale sessions when they resume. Reset invalidation prevents pre-reset working data from being restored or saved back; drafts otherwise remain independent between tabs. Successful reset returns to empty Profil setup, with ordinary first-visit release-note behavior. A storage failure is reported as incomplete reset without claiming rollback or success; retry after correcting browser storage settings.

Application reset preserves downloaded PDFs/backups, browser notification permissions, installation, service workers, offline caches, and unrelated storage. It does not affect other browsers/devices or guarantee secure erasure of browser-internal history or copies.

This app provides an invoice-generation workflow, not a guarantee of compliance with all German tax or invoicing requirements. Review the generated PDF before sending it.

## License

Copyright (C) 2026 soren.codes

Original project code and documentation are licensed under the **GNU Affero General Public License, version 3 only (AGPL-3.0-only)**. See [LICENSE](LICENSE) for the complete, unmodified standard license text. This project's grant does **not** select “or any later version”; the license's own explanatory application example is not an additional project grant.

Commercial use is permitted. The license requires covered distributed modifications to remain under its terms and includes obligations for modified software offered for interaction over a network. It does not require publication of every purely private modification or contribution of every improvement upstream. “soren.codes” is the chosen author designation, not a declaration of a newly formed company.

This default does not relicense third-party dependencies, fonts, copied UI source, vendored agent materials or other imported work. Those retain their applicable original licenses, copyright notices and attribution. In particular, the bundled Inter, Lora and JetBrains Mono fonts retain their OFL terms and any Reserved Font Names.

Generated Invoices and user-supplied Business Profile and Invoice Draft data do not become AGPL-covered merely because this application produces or processes them. Independently included third-party material keeps its own terms.

The application distribution includes the manually maintained [accompanying third-party notices](public/third-party-notices.txt) as a local static resource; see [license and notices maintenance](docs/licensing.md). Builds do not generate or audit this text. Notice delivery is distinct from corresponding-source obligations. The footer and project-license page link to the [source repository](https://github.com/DontMash/regningen). These discovery links do not implement corresponding-source delivery or certify deployment compliance; applicable obligations remain the distributor's responsibility.
