# Public visibility and deployment

`/` is a stable German introduction. Entering the application is explicit: **Rechnung erstellen** uses a successfully loaded Business Profile to choose the editor or profile setup. The Invoice editor and settings remain navigable but are explicitly noindex. Visibility information never uses browser-local working data.

## Runtime configuration

Set server-runtime `ORIGIN=https://regningen.soren.codes`. This is the authoritative absolute HTTP(S) origin, not a page URL or incoming-host fallback. Credentials, non-root paths, queries, fragments and invalid/missing values are configuration errors: visibility fails closed, with no canonical identity or public inventory. The server must receive the variable; `PUBLIC_`/`VITE_` variables are not substitutes.

Only requests whose normalized public origin matches `ORIGIN` may publish. Scheme, host and effective port matter; route paths and tracking queries do not. Development, previews and staging must have different public origins. Same-origin upstream previews and path-based previews are outside this contract.

`TRUST_PROXY` is disabled unless exactly `true`. Direct deployments use the request origin without trusting forwarded protocol or host headers. Behind TLS termination, explicitly opt in and configure the trusted reverse proxy to overwrite `X-Forwarded-Host` and `X-Forwarded-Proto` with the single public host (including a non-default port) and `http` or `https` protocol. Do not append untrusted client header values. Prevent untrusted direct access to the backend. Opting in does not authenticate proxies or sanitize their inputs for you. Unknown, malformed, ambiguous or incomplete origin information cannot enable publication.

HTML and discovery responses use `Cache-Control: private, no-store` to prevent shared-cache policy leakage. A CDN/reverse proxy must honor this or isolate responses by public scheme/host/port and proxy configuration; never reuse an indexable production document on another origin. The service worker's origin-local prepared offline documents are intentional, not shared CDN caches.

## Head and discovery

Small declarations beside their owning features feed native router head management and a lightweight discovery catalog. Shared defaults include `noIndex: false`; application pages override it to true. A registered future real page needs no second publication switch. Canonical paths are `/`, `/invoice`, `/settings`, and `/settings/profile`; trailing-slash compatibility does not create additional advertised pages.

On matching production requests, `/robots.txt` allows crawling and points to `/sitemap.xml`. The sitemap and `/llms.txt` advertise only eligible canonical pages, currently `/`. No invented freshness dates are emitted. German `de` and `x-default` alternatives point to the landing page; genuine future translations must declare an equivalent translation group and self-canonical path. Excluded variants cannot be a fallback. Structured data describes the website, landing page, and browser application, not private working screens.

Foreign or unverifiable requests remain crawlable, with noindex in HTML and `X-Robots-Tag`. Real pages retain production canonicals when configuration is valid, but omit promotional schema and language alternatives. Robots omits the sitemap; sitemap and guide return actual 404 responses. Noindex and robots are discovery directives, not access controls or privacy protections. The agent guide is neither crawler permission nor an AI-training opt-out.

## Offline content and artwork

The resolved non-secret origin/publication policy is serialized with the server-rendered router state and retained across hydration and client navigation, including prepared offline routes. Client head evaluation never guesses publication from browser location or requires a server call. Discovery endpoints are not precached as public documents.

The existing service-worker document revision includes built client/server assets the security/proxy policy source, and the build's `ORIGIN`, `TRUST_PROXY`, and `HSTS_STAGE` values. When changing origin/proxy configuration, rebuild with those same values and deploy matching runtime configuration; normal update acceptance refreshes cached documents. Do not change runtime identity while retaining an old worker indefinitely. Landing copy and page declarations affect built asset hashes, including same-version content updates.

`public/social-preview.png` is a shared 1200×630 image using fictional data. Regenerate it with `node scripts/generate-social-preview.mjs` (requires the installed Playwright Chromium). Its artwork is static and anonymously fetchable; pages can override image information in their own declaration.

See [browser security and HTTPS deployment](security.md) for the shared proxy contract, CSP authorization, HSTS rollout, and policy-only offline updates.

Tests prove delivered HTML, HTTP contracts, browser navigation and offline updates. They do not prove actual search indexing, rich results, social-platform cache refresh timing, ranking, or agent uptake.
