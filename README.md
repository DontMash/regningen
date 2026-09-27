# regningen

A German-language invoice generator application built with React, TanStack Start, and Tailwind CSS.

## Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

The app is available at <http://localhost:3000>.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

The unit tests use Vitest. The Playwright integration tests use Chromium; install it once with:

```bash
pnpm exec playwright install chromium
```

## Production

Build the application with `pnpm build`. To preview the production build locally, run `pnpm preview`.
