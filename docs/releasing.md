# Releasing

## Initial baseline

The manifest and generated changelog establish `1.0.0` as the initial baseline. Its notes come from the existing commit history; there are no invented earlier releases.

After committing and verifying these prepared files, the maintainer records the first local release boundary manually:

```bash
git tag -a v1.0.0 -m v1.0.0
```

Do this once, before using the release command for subsequent releases. Changelogen cannot release `-r 1.0.0` when the manifest already has that version. No bootstrap script or automatic tag creation is provided.

## Subsequent releases

Prepare a local release from a clean working tree:

```bash
pnpm release
```

This runs `changelogen --release --clean --no-github` directly. Changelogen infers the SemVer bump from Conventional Commits, updates `package.json` and `CHANGELOG.md`, preserves earlier entries, and creates a local release commit and `v<version>` tag.

Use its native overrides when needed:

```bash
pnpm release --major
pnpm release --minor
pnpm release --patch
pnpm release -r 2.4.0
```

The command uses changelogen's native behavior rather than custom guards. `--clean` rejects a dirty tree, but an empty or non-bumping range defaults to a patch bump. Review the commit range before releasing. There are no custom release-workflow scripts or tests.

The configured command does not push, deploy, publish, or create a remote release. Review and push the resulting commit and tag separately; remote operations remain explicit maintainer choices.

## Bundled release data

The package manifest and generated changelog are the runtime version and release-note sources. The build validates that the manifest version has a matching latest changelog entry before bundling release data.
