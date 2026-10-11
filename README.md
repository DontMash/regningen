# regningen

A German-language invoice generator application built with React, TanStack Start, and Tailwind CSS.

## Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The app is available at <http://localhost:3000>.

See the [testing guide](docs/testing.md) for test architecture and contribution conventions.

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

## Local data and invoices

The app server delivers the generic application shell; business profile data is read and written only in the current browser's local storage. Recipient details and invoice entries are kept in memory for the current page session, and the PDF is generated in the browser and downloaded through the browser. Refreshing or closing the page loses invoice entries. Clearing site data removes the business profile.

The profile can be exported and imported as JSON. Backups are **not encrypted** and contain sensitive business information, so store them securely. Export a backup before clearing browser data or moving to another browser or device.

This app provides an invoice-generation workflow, not a guarantee of compliance with all German tax or invoicing requirements. Review the generated PDF before sending it.
