import { createMiddleware, createStart } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { resolveDeployment } from '@/lib/visibility'

const visibilityMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const trustProxy = process.env.TRUST_PROXY === 'true'
    let publicRequestUrl: string | undefined
    try {
      const host = request.headers.get('x-forwarded-host')
      const protocol = request.headers.get('x-forwarded-proto')
      // H3 tolerates lists and malformed URL setters. Our proxy contract does not:
      // only one sanitized host/protocol pair can establish a public origin.
      const validForwarding =
        !trustProxy ||
        (host === null && protocol === null) ||
        (host !== null &&
          protocol !== null &&
          /^(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d+)?$/i.test(host) &&
          (protocol === 'http' || protocol === 'https'))
      if (validForwarding) {
        const reconstructed = getRequestUrl({
          xForwardedHost: trustProxy,
          xForwardedProto: trustProxy,
        })
        if (
          !trustProxy ||
          host === null ||
          new URL(`${protocol}://${host}`).origin === reconstructed.origin
        ) {
          publicRequestUrl = reconstructed.href
        }
      }
    } catch {
      // An unverifiable request must never acquire the configured identity.
    }
    const visibilityPolicy = resolveDeployment(
      process.env.ORIGIN,
      publicRequestUrl,
    )
    if (!visibilityPolicy.canonicalOrigin) {
      console.error('Invalid or missing ORIGIN: public visibility is disabled.')
    }
    const result = await next({ context: { visibilityPolicy } })
    const headers = new Headers(result.response.headers)
    headers.set('Cache-Control', 'private, no-store')
    if (!visibilityPolicy.publish || result.response.status >= 400)
      headers.set('X-Robots-Tag', 'noindex')
    return {
      ...result,
      response: new Response(result.response.body, {
        status: result.response.status,
        statusText: result.response.statusText,
        headers,
      }),
    }
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [visibilityMiddleware],
}))

declare module '@tanstack/react-start' {
  interface Register {
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
