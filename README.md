# regningen

regningen is a German and English invoice generator for creating and downloading PDF invoices. It runs in the browser, with a reusable Business Profile and an editable Invoice Draft. The interface and generated invoices support both languages.

Built with React, TanStack Start, Paraglide, and Tailwind CSS, the application also supports installation and prepared offline use in compatible browsers.

Business Profile and Invoice content stay in your browser; the app server delivers pages and assets, not invoice processing. PDFs are generated locally. Invoice Drafts are saved per tab for reload recovery, but browser storage is temporary and is not an archive. Back up important data and keep downloaded invoices separately.

This project provides an invoice-generation workflow, not a guarantee of compliance with German tax or invoicing requirements. Review every generated PDF before sending it.

## Development

Install Node.js and pnpm, then run these commands from the project directory:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. No environment file is required for local development. Optional settings and environment-file precedence are documented in the [configuration guide](docs/configuration.md).

For a local production preview:

```bash
pnpm build
pnpm preview
```

Preview is available at <http://127.0.0.1:4173>. For deployment, follow the configuration and security guides linked below rather than treating the development server as production hosting.

## Verification

Install Playwright's Chromium browser before running browser tests:

```bash
pnpm exec playwright install chromium
```

Run the full verification sequence before considering changes complete:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm build
pnpm test:coverage
pnpm test:e2e
```

`pnpm format` checks formatting without rewriting files; use `pnpm format:fix` to apply formatting changes. Vitest runs unit and module-level integration tests, and Playwright runs browser-level integration tests. For a Vitest run without coverage, use `pnpm test`.

See the [testing guide](docs/testing.md) for test architecture and contribution conventions. Optional Lighthouse lab audits run separately with `pnpm test:vitals`; consult the [audit guide](docs/vitals.md) for prerequisites and limitations. These audits replace the local production build output.

## Documentation

For contributing and maintaining the project:

- [Coding standards](CODING_STANDARDS.md) — design expectations and engineering guidance.
- [Glossary](GLOSSARY.md) — shared domain terminology.
- [Release guide](docs/releasing.md) — preparing local releases.

For deployment:

- [Configuration](docs/configuration.md) — environment settings, modes, and startup.
- [Public visibility](docs/visibility.md) — public identity, indexing, and proxy handling.
- [Security](docs/security.md) — browser policies, HTTPS responsibilities, and HSTS rollout.

## License

Copyright (C) 2026 soren.codes

Original project code and documentation are licensed under the **GNU Affero General Public License, version 3 only (AGPL-3.0-only)**. See [LICENSE](LICENSE) for the complete terms. Commercial use is permitted, subject to the license's applicable distribution and network-use obligations.

Generated invoices and user-supplied Business Profile and Invoice Draft data do not become AGPL-covered merely because the application produces or processes them.

Third-party materials retain their own terms. See the [accompanying third-party notices](public/third-party-notices.txt) and [license and notices guide](docs/licensing.md) for scope, maintenance, and distributor responsibilities.
