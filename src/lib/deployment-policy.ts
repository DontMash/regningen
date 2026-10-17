export type DeploymentPolicy = {
  canonicalOrigin: string | null
  publish: boolean
}

function httpUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null
    return url
  } catch {
    return null
  }
}

/** Pure build/server policy: never depends on generated locale code or a request's language. */
export function resolveDeployment(
  origin: string | undefined,
  requestOrigin: string | undefined,
): DeploymentPolicy {
  const configured = httpUrl(origin)
  const canonicalOrigin =
    configured &&
    /^https?:\/\/[^\s\\/?#]+\/?$/i.test(origin ?? '') &&
    configured.pathname === '/' &&
    !configured.search &&
    !configured.hash
      ? configured.origin
      : null
  return {
    canonicalOrigin,
    publish:
      canonicalOrigin !== null &&
      canonicalOrigin === httpUrl(requestOrigin)?.origin,
  }
}
