import { createMiddleware, createStart } from '@tanstack/react-start'
import { resolveDeployment } from '@/lib/visibility'
import { publicRequestUrl } from '@/lib/public-request'
import { contentSecurityPolicy } from '@/lib/security-policy'
import { readEnvironment } from '@/env'

const visibilityMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const environment = readEnvironment(process.env)
    const visibilityPolicy = resolveDeployment(
      environment.ORIGIN,
      publicRequestUrl(request, environment.TRUST_PROXY),
    )
    const securityNonce = import.meta.env.DEV
      ? undefined
      : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    const result = await next({ context: { visibilityPolicy, securityNonce } })
    const headers = new Headers(result.response.headers)
    if (!import.meta.env.DEV) {
      headers.set(
        'Content-Security-Policy',
        contentSecurityPolicy(securityNonce),
      )
    }
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
