## Verification

After any code-related changes, run these package scripts and require each to pass before considering the work complete:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:coverage`
- `pnpm test:e2e`

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
