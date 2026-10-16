/** Repository-owned HTTP policy. Development tooling never uses this CSP. */
export function contentSecurityPolicy(nonce?: string) {
  const authorization = nonce ? ` 'nonce-${nonce}'` : ''
  return [
    "default-src 'self'",
    `script-src 'self'${authorization}`,
    `style-src 'self'${authorization}`,
    `style-src-elem 'self'${authorization}`,
    // Base UI positioning, React styles and the theme's color-scheme require
    // attributes. This exception cannot authorize scripts or style elements.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const hstsDurations: Record<string, number> = {
  'one-day': 86_400,
  'one-week': 604_800,
  'one-year': 31_536_000,
  reset: 0,
}

export function securityHeaders(
  publicRequestUrl: string | undefined,
  stage: string | undefined,
) {
  const headers = new Headers({
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  const duration =
    stage !== undefined && Object.hasOwn(hstsDurations, stage)
      ? hstsDurations[stage]
      : undefined
  if (publicRequestUrl?.startsWith('https://') && duration !== undefined) {
    headers.set('Strict-Transport-Security', `max-age=${duration}`)
  }
  return headers
}
