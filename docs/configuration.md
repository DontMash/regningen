# Environment configuration

Local development needs no environment file. Application deployment settings are optional and safe by default: no public identity, no proxy trust, and no HSTS.

**t3-env validates configuration; Vite loads local environment files.** Validation does not load files. The same application schema validates the effective build and server-process inputs; these are server/build settings, not browser environment variables. `PUBLIC_` or `VITE_` equivalents are not supported substitutes.

## Application settings

| Input         | Accepted nonempty value                                           | Omitted or empty                                   |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `ORIGIN`      | A bare absolute HTTP(S) origin, for example `https://example.com` | Effective `undefined`; no public identity, noindex |
| `TRUST_PROXY` | Exactly `true` or `false`, converted to a typed boolean           | Boolean `false`                                    |
| `HSTS_STAGE`  | Exactly `off`, `one-day`, `one-week`, `one-year`, or `reset`      | `off`                                              |

An empty string selects the same default as an absent input. Other malformed nonempty values are errors, not defaults. In particular, `TRUE`, `1`, whitespace, and unknown strings are not aliases for accepted proxy or HSTS settings.

`ORIGIN` accepts only HTTP or HTTPS, with a valid host and optional port. Credentials, non-root paths, queries and fragments (even empty `?` or `#` delimiters), whitespace, and missing schemes are rejected. An optional root slash is accepted. Accepted origins are normalized using URL-origin semantics: `HTTPS://EXAMPLE.COM:443/` becomes `https://example.com`; a non-default port remains part of the effective origin. Canonical identity is never inferred from request hosts, forwarded headers, or browser location.

With no origin, documents remain noindex and advertise no canonical identity or public inventory. A valid origin permits publication only for requests whose normalized public origin matches it. See [public visibility](visibility.md) for discovery and request-level fail-closed behavior.

`TRUST_PROXY=true` is an explicit operational opt-in, not proxy authentication. A trusted reverse proxy must overwrite forwarding headers and the backend must be protected from untrusted direct access. HSTS still requires established public HTTPS; a configured HTTPS origin alone proves nothing about the request protocol. See [browser security and HTTPS deployment](security.md) for these requirements and each HSTS stage's header and rollout/rollback contract.

## Optional local setup

To customize local settings, copy the safe example and edit the copy:

```sh
cp .env.example .env.local
```

The example leaves `ORIGIN` empty, sets `TRUST_PROXY=false`, and sets `HSTS_STAGE=off`. Copying it is optional. `.env.example` is tracked but never loaded automatically. Actual `.env` and `.env.*` files are ignored by Git, except for this example.

## Local commands, modes, and precedence

Development, build, and production preview use the same Vite environment-file loading contract. From lowest to highest precedence:

1. `.env`
2. `.env.local`
3. `.env.<mode>`
4. `.env.<mode>.local`
5. Existing shell/process environment

Later sources override earlier sources. Shell values always win, **including an explicitly empty string**. For example, `ORIGIN='' pnpm dev` overrides a nonempty origin in any environment file and selects no public identity. Unprefixed application settings are loaded for server consumers; do not rename them to public client variables.

| Command        | Default mode  | Listener                                   |
| -------------- | ------------- | ------------------------------------------ |
| `pnpm dev`     | `development` | Existing development server on port `3000` |
| `pnpm build`   | `production`  | No listener; produces `.output`            |
| `pnpm preview` | `production`  | Built Node server on `127.0.0.1:4173`      |

Explicit mode selection is supported:

```sh
pnpm dev --mode staging
pnpm build --mode staging
pnpm preview --mode staging
```

Use matching effective settings when building and previewing. `.env.preview` has no special preview precedence; it is a mode-specific file only when selecting `--mode preview`.

Preview requires an existing build and launches `.output/server/index.mjs`, using the same production HTTP and security behavior as direct Node startup. Its supported options are `--host HOST`, `--port PORT`, and `--mode MODE`:

```sh
pnpm preview --host 127.0.0.1 --port 4174 --mode staging
```

Preview uses the requested port strictly: if it is unavailable, the command fails rather than silently choosing another port. It is not Vite's preview server; arbitrary Vite preview flags are not supported.

## Validation and startup failures

Explicitly malformed nonempty application settings fail development startup, the build, preview startup, or direct production startup, as applicable. Runtime validation happens before readiness or serving requests, including static assets; it does not wait for the first rendered page. Errors identify the invalid setting and its accepted form without dumping the process environment.

Absent and empty inputs remain valid. Request-level checks still fail closed for foreign or unverifiable request origins and malformed forwarding information; startup validation does not replace those checks.

## Direct production startup

A directly launched production server **does not automatically load any environment files**, including project `.env` files. Supply the environment through the shell, hosting platform, or process manager:

```sh
ORIGIN=https://example.com TRUST_PROXY=false HSTS_STAGE=off pnpm build
ORIGIN=https://example.com TRUST_PROXY=false HSTS_STAGE=off node .output/server/index.mjs
```

`https://example.com` is a placeholder, not a default: use the actual public origin only for the intended deployment. The example uses direct-request protocol handling; TLS termination requires the trusted-proxy contract before enabling `TRUST_PROXY=true`.

Alternatively, explicitly ask the supported Node runtime to load a deployment-owned file before application validation:

```sh
node --env-file=/path/to/file .output/server/index.mjs
```

Existing shell variables override values in that file, including explicitly empty shell values. Node's explicit environment-file option is separate from the local Vite file-selection contract.

Values loaded inside `pnpm build` are **not inherited by a separately launched server**. Supplying an origin only to the build does not configure runtime identity. Configure both processes deliberately.

## Matching build and runtime settings

Use matching **effective** `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` at build and runtime. Equivalent omitted, empty, or explicitly defaulted values have the same configuration contribution to the PWA document revision; accepted origin spellings are normalized first.

Changes require a rebuild and a server restart with the intended configuration. The existing PWA document revision includes these effective settings alongside built assets and policy sources, so configuration-only changes refresh prepared offline documents through the normal update flow. A runtime-only change cannot revise an already shipped worker. Restart local commands after changing their environment; no environment hot-reload guarantee is made.

Matching is an operational requirement, **not an artifact lock**: startup does not compare otherwise valid runtime settings to a build manifest. This configuration contract does not redesign PWA caching, update postponement/acceptance, or browser-local working data. See [offline visibility updates](visibility.md#offline-content-and-artwork) and [security policy updates](security.md#deployment-inputs-and-cached-updates).

## Production build and PWA integration

`vite.config.ts` keeps the generated Workbox worker and prompted registration.
With installed Nitro `3.0.260610-beta` and vite-plugin-pwa `2.0.0`, PWA's shared-config
`closeBundle` generates workers for multiple environments, after Nitro has already
indexed public-asset metadata. A small compatibility shim suppresses only that
hook and calls the public PWA asset-generator/worker APIs once from Vite's
Nitro-environment `buildStart`, after client/SSR assets and public copying but
before server compilation. Manifest emission remains plugin-owned. There is no
generated-server JavaScript parser or metadata rewriting.

The [upstream integration issue](https://github.com/vite-pwa/vite-plugin-pwa/issues/940)
and [Nitro module documentation](https://nitro.build/docs/modules) are leads, not
proof of released compatibility. The investigated published Nitro
`3.0.260903-beta` also lacks the documented `vite:compile:before` hook; it does not
justify an upgrade. Remove the shim when a released first-class integration
supports this ordering and the production PWA journeys pass without it.

SSR stylesheet publication is independent. Copying emitted SSR CSS into public
assets remains necessary: removing it failed the isolated production tests with
an unavailable stylesheet referenced by SSR HTML, even though an ordinary local
build appeared to contain its CSS. Remove that copy only after exact stylesheet
responses and offline production journeys pass without it.

Offline preparation still eagerly precaches core localized SSR documents and
necessary assets. Runtime navigation caching alone misses unvisited screens; no
static application shell has been established for this SSR application. The
small document inventory (including slash aliases) and content/configuration/
policy-sensitive revision are retained rather than replacing them with a weaker
SemVer key or a larger prerendering adapter. Production tests cover same-version
content, configuration, notices, and policy updates, both-language startup, and
real offline PDFs rather than inspecting the generated revision syntax.

The build wrapper remains for argument forwarding, failure propagation, and
shipping `.output/LICENSE`. The localization wrapper remains a direct compile
call using shared options; replacing it with a CLI plus another config re-export
would not remove meaningful responsibility. Preview retains environment loading,
empty-shell precedence, mode/listener selection, and production-entry validation.
Application artwork generation and the stable-origin multi-build test harness
remain application-specific capabilities, not candidates for a larger framework.
No dependency or distributed-license changes accompany this integration change.

## Framework and tooling controls

Listener configuration belongs to Nitro, not the application t3-env schema. For direct Node startup, `NITRO_HOST` and `NITRO_PORT` set the bind host and port; `HOST` and `PORT` are framework aliases. For example:

```sh
NITRO_HOST=127.0.0.1 NITRO_PORT=3000 node .output/server/index.mjs
```

These control where the server listens, not canonical identity or proof of public HTTPS. Local preview defaults and its host/port options are documented above.

`CI` and `VITALS_CALIBRATE` belong to test/tooling configuration, not the application schema. See the [testing guide](testing.md) and [native Lighthouse lab audits](vitals.md) for test execution and explicit report-only calibration.
