# regningen

A German-language invoice generator application built with React, TanStack Start, and Tailwind CSS.

## Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The app is available at <http://localhost:3000>.

See the [testing guide](docs/testing.md) for test architecture and contribution conventions, and the [release guide](docs/releasing.md) for preparing a local release.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Unit and module-level integration tests use Vitest. Browser-level integration tests use Playwright with Chromium; install it once with:

```bash
pnpm exec playwright install chromium
```

## Production

Build the application with `pnpm build`. To preview the production build locally, run `pnpm preview`.

## Installable app and offline use

Production builds include the install manifest, receipt artwork, release metadata, and a versioned service worker. Production hosting must serve the app and `/sw.js` over HTTPS (localhost is suitable for testing), keep the worker URL and `/` scope stable, and allow worker update checks by not caching `/sw.js` or `/pwa-release.json`. The current deployment supports the root path; hosting under a subdirectory is not verified. `pnpm test:e2e` exercises two isolated production builds on one local origin, including the real worker lifecycle and an offline Invoice PDF.

Visit online once and wait for **Offline bereit** before relying on offline startup. The worker prepares the app shell, core routes, lazy-loaded assets, fonts, icons, and release notes. Browser storage can still be evicted, and installation does not guarantee permanent offline access. Browser installation support varies; use the explicit Installieren control for native prompting or platform guidance. No install prompt appears automatically.

Updates are staged in the background and shown with the incoming changelog. **Update jetzt** coordinates open tabs and temporarily stores each tab's unfinished Invoice in session storage for the protected update reload. **Später** and dismissal neither acknowledge the incoming release nor force an immediate reload. Ordinary refreshes, deliberate tab closure, and permanent Invoice draft storage are outside this protection; browsers may activate a waiting worker naturally after all old application windows close.

PDF notifications are optional and separately enabled after installation/permission where the platform requires it. They identify the downloaded filename only; the PDF remains in browser/OS Downloads and must be opened there. Notifications do not upload invoice data, retain a PDF copy, or guarantee OS delivery.

### Manual platform checks

Headless tests verify application handling, not actual OS installation or notification display. Before deploying, check Chromium desktop/Android and Safari macOS/iOS/iPadOS on HTTPS: install explicitly, cancel without losing work, verify receipt artwork and maskable cropping, launch standalone with Install hidden, and launch the Invoice workflow offline after preparation. On supported platforms, enable notifications separately, export a PDF, verify the filename and Downloads guidance, then deny/revoke permission and disable notifications to confirm downloads still work. On iOS/iPadOS, check the Home Screen prerequisite. These device checks are not automated by the repository.

## Local data and invoices

The app server delivers the generic application shell; business profile data is read and written only in the current browser's local storage. Recipient details and invoice entries are kept in memory for the current page session, and the PDF is generated in the browser and downloaded through the browser. Ordinary refreshes or closing the page lose invoice entries. Clearing site data removes the business profile.

Release notes use TanStack Store for shared feature state and unstorage for browser acknowledgment persistence. This adoption is limited to release notes for now; the rest of the application's shared state and browser persistence still needs to adopt this approach. Invoice drafts ordinarily remain memory-only; accepted updates use temporary per-tab session snapshots. Business Profile storage and backup formats are unchanged.

The profile can be exported and imported as JSON. Backups are **not encrypted** and contain sensitive business information, so store them securely. Export a backup before clearing browser data or moving to another browser or device.

This app provides an invoice-generation workflow, not a guarantee of compliance with all German tax or invoicing requirements. Review the generated PDF before sending it.
