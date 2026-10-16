# Browser security and HTTPS deployment

## Repository policy

`src/lib/security-policy.ts` owns the HTTP policies. The Nitro response plugin in `src/server/plugins/security.ts` applies them to application-served documents, discovery, errors, generated assets, and conditional responses without changing their statuses, bodies, MIME types, or caching. Production builds and production-style previews enforce CSP; local `pnpm dev` remains available for development tooling.

| Header                    | Contract                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Referrer-Policy           | `no-referrer` everywhere                                                              |
| X-Content-Type-Options    | `nosniff`, alongside correct resource MIME types                                      |
| X-Frame-Options           | `DENY`, including same-origin parents                                                 |
| Content-Security-Policy   | Enforced same-origin resource policy; no script eval or unauthorized inline execution |
| Permissions-Policy        | `camera=(), microphone=(), geolocation=()`                                            |
| Strict-Transport-Security | Explicit host-only rollout, only on established public HTTPS                          |

CSP denies objects, child frames, and inbound framing; base URLs and form destinations are restricted to the same origin. No reporting endpoint or background security telemetry is configured. External hyperlinks are navigations, not permission to load third-party resources.

Start middleware creates a cryptographically random 192-bit nonce per fresh production render. The matching CSP header and router `ssr.nonce` authorize the handwritten theme bootstrap, hydration/streaming scripts, head scripts, and style elements. Router recovers the original nonce from its CSP meta tag during hydration; Base UI receives it through `CSPProvider`. JSON-LD is encoded as native head scripts because the installed router's JSON-LD meta helper does not propagate its nonce. HTML remains `private, no-store`; do not put nonce-bearing documents in a shared CDN cache.

The sole inline concession is `style-src-attr 'unsafe-inline'`, for existing server-rendered component styles, popup positioning, and theme color-scheme styling. Style elements still require a nonce or same-origin stylesheet. This concession does not permit inline scripts or event handlers. Zod uses its supported `jitless` interpreter before schemas are constructed, avoiding even caught eval violations. Vite emits font/artwork files instead of data URLs. PDF and JSON Blob downloads work without adding `blob:` to script/default sources.

`/sw.js` receives its own CSP response header: same-origin scripts/imports and connections, with no nonce, eval, or inline script permission. The document's `worker-src` alone would not protect worker execution. Workbox caches each prepared HTML response with its original headers and nonce. Offline reuse of that complete origin-local response is intentional; fresh network renders never share a deployment-wide nonce.

## Deployment inputs and cached updates

Use the same `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` values at **build and runtime**. Prepared-document revisions include built assets, the security/proxy policy source, and these deployment inputs. A policy-only change therefore prepares new documents through the existing worker update flow even without a version or visible-content change. Rebuild when changing policy or configuration; a runtime-only change cannot revise an already shipped worker.

Disconnected clients keep the policy they previously received. Postponing updates keeps the old complete response while its worker remains active. Normal browser lifecycle activation after old clients close, and another tab's accepted update, still apply; there is no new cross-tab veto or update protocol. Existing unsaved-change guards and per-tab Invoice Draft recovery remain in place. Security deployment does not reset user data, delete unrelated caches, or erase downloaded files.

Public protocol uses the **same** `src/lib/public-request.ts` contract as visibility. `ORIGIN=https://…` is not evidence that a request used HTTPS. `TRUST_PROXY` is disabled unless exactly `true`. Opting in requires a protected backend and a trusted proxy that overwrites both `X-Forwarded-Host` and `X-Forwarded-Proto` with one sanitized host and `http` or `https`. Lists, missing counterparts, empty values, or malformed values cannot establish HTTPS. Do not expose the trusted backend directly. See [visibility deployment](visibility.md).

## HSTS rollout and rollback

Leave HSTS off until public HTTPS prerequisites are verified. HSTS does not issue or renew certificates: Let's Encrypt provides the certificate independently.

| `HSTS_STAGE`   | HTTPS response                                   |
| -------------- | ------------------------------------------------ |
| unset or `off` | Header omitted; not yet enabled                  |
| `one-day`      | `max-age=86400`                                  |
| `one-week`     | `max-age=604800`                                 |
| `one-year`     | `max-age=31536000`                               |
| `reset`        | `max-age=0` to clear a previously learned policy |

Unknown stage values fail closed by omitting HSTS. No stage includes `includeSubDomains` or `preload`. Promotion is an explicit build/deployment action, never a timer: observe one day for at least one day, then one week for at least one week before considering one year. Record observations and recheck certificate-renewal arrangements before each promotion.

Each received HSTS header refreshes the browser's remembered duration. During that period the browser upgrades future HTTP navigations and certificate failures become hard connection failures. Maintain HTTP-to-HTTPS redirection for first visits: without preloading, HSTS cannot protect an initial insecure visit before the policy is learned.

Omitting the header does **not** clear an existing browser policy. Roll back with `HSTS_STAGE=reset`, rebuilt and deployed over functioning, valid HTTPS; keep HTTPS working throughout rollback and while clients may still remember an older duration. Offline clients cannot immediately receive rollback or protection updates.

## Footer attribution

Only the **soren** credit navigates to `https://www.soren.codes/?utm_source=regningen&utm_medium=referral`. Parameters are fixed, never derived from routes, incoming queries, identities, or browser-local data. The new tab retains `noopener noreferrer`; global referrer suppression is not relaxed. Impressum and Datenschutz remain untagged. Rendering the footer sends no analytics or attribution request. Compatible destination analytics may interpret the parameters; destination configuration/ingestion is not guaranteed here.

## Public HTTPS deployment checklist

Local production tests prove application behavior, **not successful public deployment**. Complete and record these checks at the actual endpoint:

1. Resolve the intended public hostname and verify the deployed application over HTTPS with a valid Let's Encrypt certificate, correct hostname/chain, and expiry. Planning could not resolve the documented hostname; do not treat that historical observation as a current outage diagnosis.
2. Verify automated renewal configuration, a successful dry-run/test, monitoring, and operational ownership. Keep HTTPS available during rollout and rollback.
3. Verify first-visit HTTP-to-HTTPS redirection, preserving paths as intended. Confirm the actual proxy contract, overwritten forwarding headers, and blocked direct backend access before enabling `TRUST_PROXY=true`.
4. Inspect public GET responses for `/`, `/invoice`, a safe unknown URL, discovery, `/sw.js`, manifest, and representative scripts/styles/fonts/images. Verify headers, MIME types, actual statuses and cache behavior, including validators. Ensure `/sw.js` retains `no-cache, no-store, must-revalidate` and documents retain `private, no-store`.
5. Check CDN/proxy-served assets and independently generated error/redirect responses separately. Application hooks cannot protect bytes served outside Nitro. Configure those layers where needed; eliminate duplicate/conflicting CSPs and prevent shared caching of nonce-bearing HTML.
6. On HTTPS Chromium desktop/Android and Safari/WebKit macOS/iOS/iPadOS, check initial/system theme, menus/dialogs, profile JSON export/import and explicit save, actual PDF contents/downloads, installation/artwork/standalone launch, prepared offline startup/navigation, update postponement/acceptance, and optional notifications. Denial/revocation/failure must not stop downloads; iOS notification prerequisites and OS delivery need real-device checks.
7. Only after prerequisites pass, build/deploy `HSTS_STAGE=one-day`. Record the date and observations. Explicitly promote to `one-week`, then `one-year` after the observation periods and readiness checks above. Never add subdomain/preload commitments incidentally.
8. Optionally use [SecurityHeaders](https://securityheaders.com/faq/) as a diagnostic of delivered response configuration. A scanner grade is not a security audit, penetration test, TLS-renewal guarantee, privacy/legal assessment, or proof that all browser-local data is secure.

## Automated evidence and references

Normal `pnpm test:e2e` includes isolated real Nitro HTTP/browser acceptance in `tests/e2e/security-headers.spec.ts` and `tests/e2e/pwa.spec.ts`. Chromium observes successful journeys from initial document loading, with separate deliberately blocked probes; downloads are inspected as files. Controlled loopback proxy headers prove HSTS response selection, **not** TLS negotiation, browser HSTS persistence, certificates, or renewal. No dedicated cross-browser platform or external collector is introduced.

- [OWASP security response headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) and [CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security) and [worker CSP](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy)
- [Base UI CSPProvider](https://base-ui.com/react/utils/csp-provider) and [TanStack SSR styling/nonces](https://tanstack.com/start/latest/docs/framework/react/guide/css-styling)
