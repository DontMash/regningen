## Verification

After any code-related changes, run these package scripts and require each to pass before considering the work complete:

- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:coverage`
- `pnpm test:e2e`

## Testing

Test architecture, E2E contribution workflow, setup policy, and support-module locations: [docs/testing.md](docs/testing.md).

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default state labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
