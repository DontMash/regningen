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

Build the application with `ORIGIN=https://regningen.soren.codes pnpm build`. Set the same server-runtime `ORIGIN` when serving production. To preview the production build locally, run `pnpm preview`; its different origin is deliberately noindex. See [public visibility and deployment](docs/visibility.md) for origin validation, explicit `TRUST_PROXY` opt-in, proxy sanitization, cache isolation, discovery endpoints, and offline metadata updates.

## Settings

Open **Einstellungen** using the cogwheel in the header. The settings aside links to **Allgemein** (`/settings`) and **Profil** (`/settings/profile`); the old profile address is no longer available. Allgemein contains appearance, installation, local PDF notifications, and application reset. The header theme shortcut remains synchronized with the System/Hell/Dunkel selection.

Profil contains the Business Profile form and backup/delete controls. Editing and importing change only the working form: choose **Profil speichern** to persist a valid profile. Save stays on Profil; **Rechnung** returns to invoicing without discarding the tab's Invoice Draft. Leaving with unsaved profile changes offers a discard warning; manual tab close/reload uses the browser's best-effort native warning. Ordinary saves in multiple tabs silently use the last successful save, without conflict warnings or merging.

## Installable app and offline use

Production builds use `vite-plugin-pwa` to generate the manifest, receipt-derived installation artwork, and a Workbox service worker. The worker precaches the server-rendered root, Invoice, Allgemein, and Profil documents plus application chunks, fonts, styles, and generated icons. Production hosting must serve the app and `/sw.js` over HTTPS (localhost is suitable for testing), keep the worker URL and `/` scope stable, and avoid caching `/sw.js`. The current deployment supports the root path; hosting under a subdirectory is not verified. `pnpm test:e2e` builds and serves isolated production deployments to exercise real offline routing, PDF generation, and prompt-managed updates.

Visit online once and wait for **Offline bereit** before relying on offline startup. The generated worker prepares the core server-rendered routes, lazy-loaded assets, fonts, styles, and icons. Browser storage can still be evicted, and installation does not guarantee permanent offline access. Browser installation support varies; use the explicit Installieren control for native prompting or platform guidance. No install prompt appears automatically.

New content is downloaded in the background. When it is ready, **Update verfügbar** offers **Update jetzt** and **Später**; postponing or dismissing leaves the update discoverable in the footer. The notice does not preview incoming release notes. Accepting an update does not acknowledge or suppress notes for an incoming release; after reload, the existing release-note acknowledgment rules apply. This migration also removes strict validation that an old page and newly activated worker belong to a compatible release. Updates use the plugin's standard worker lifecycle: the application does not coordinate consent or preparation across tabs, and a browser may activate a waiting worker after old clients close. The application delays its own reload while a local PDF or Business Profile write is active. Unsaved profile changes require explicit discard before this tab requests an update and again before a plugin-requested reload if new changes exist. Canceling keeps the current document and edits; a deferred reload remains accessible through the footer update control. This is not a veto over worker activation, including activation requested by another tab.

The complete editable Invoice Draft is autosaved in each tab's `sessionStorage`, including incomplete and invalid values and an unsubmitted Invoice Position. It restores automatically after ordinary reloads and plugin-managed updates, and remains after PDF export. Confirming **Neue Rechnung** clears it before resetting the form. Browser session storage is temporary: it is not an archive or a guarantee of recovery after tab closure, crashes, process termination, eviction, or clearing site data. Tabs do not synchronize their drafts, though a tab opened from another may initially inherit a copy according to browser session behavior. A native unload warning is shown while Invoice Draft changes have not persisted or Business Profile edits remain unsaved; browsers control its wording and reliability.

PDF notifications are optional and separately enabled after installation/permission where the platform requires it. They identify the downloaded filename only; the PDF remains in browser/OS Downloads and must be opened there. Notifications do not upload invoice data, retain a PDF copy, or guarantee OS delivery.

### Manual platform checks

Headless tests verify application handling, not actual OS installation or notification display. Before deploying, check Chromium desktop/Android and Safari macOS/iOS/iPadOS on HTTPS: install explicitly, cancel without losing work, verify receipt artwork and maskable cropping, launch standalone with Install hidden, and launch the Invoice workflow offline after preparation. On supported platforms, enable notifications separately, export a PDF, verify the filename and Downloads guidance, then deny/revoke permission and disable notifications to confirm downloads still work. On iOS/iPadOS, check the Home Screen prerequisite. These device checks are not automated by the repository.

## Local data and invoices

The app server delivers server-rendered documents and application assets; it does not receive Business Profile or Invoice content. Business Profile data stays in the current browser's local storage. Invoice Drafts use TanStack Store as working state and unstorage's session-storage driver for per-tab autosaving. The PDF is generated locally and downloaded through the browser. Clearing site data removes the Business Profile and may remove other browser-managed application data.

The profile can be exported and imported as JSON. Export includes only the last saved profile, not unsaved edits; imported values require a later valid **Profil speichern** action. Structurally supported incomplete backups remain editable. Backups are **not encrypted** and contain sensitive business information, so store them securely. Export a backup before clearing browser data or moving to another browser or device.

**Profil löschen** removes only the saved Business Profile and clears its working form; Invoice Drafts and general preferences remain. **Anwendung zurücksetzen** instead removes the Business Profile, Invoice Drafts and unfinished Positions, appearance and notification preferences, and release-note acknowledgments. Its confirmation applies to all reset-aware application tabs sharing this browser's site storage, including stale sessions when they resume. Reset invalidation prevents pre-reset working data from being restored or saved back; drafts otherwise remain independent between tabs. Successful reset returns to empty Profil setup, with ordinary first-visit release-note behavior. A storage failure is reported as incomplete reset without claiming rollback or success; retry after correcting browser storage settings.

Application reset preserves downloaded PDFs/backups, browser notification permissions, installation, service workers, offline caches, and unrelated storage. It does not affect other browsers/devices or guarantee secure erasure of browser-internal history or copies.

This app provides an invoice-generation workflow, not a guarantee of compliance with all German tax or invoicing requirements. Review the generated PDF before sending it.
