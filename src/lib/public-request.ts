/** Shared public-protocol contract for visibility and security, never ORIGIN. */
export function publicRequestUrl(
  request: Request,
  trustProxy: boolean,
): string | undefined {
  try {
    const direct = new URL(request.url)
    if (!['http:', 'https:'].includes(direct.protocol)) return undefined
    if (!trustProxy) return direct.href

    const host = request.headers.get('x-forwarded-host')
    const protocol = request.headers.get('x-forwarded-proto')
    if (host === null && protocol === null) return direct.href
    // Both fields must be present, single-valued and sanitized. Never fall back
    // to the direct URL for present-but-invalid forwarding.
    if (
      host === null ||
      protocol === null ||
      !/^(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d+)?$/i.test(host) ||
      (protocol !== 'http' && protocol !== 'https')
    )
      return undefined
    const publicUrl = new URL(`${protocol}://${host}`)
    // Assign path/search rather than resolve a relative URL: a path beginning
    // with // must never replace the trusted public authority.
    publicUrl.pathname = direct.pathname
    publicUrl.search = direct.search
    return publicUrl.href
  } catch {
    return undefined
  }
}
