import handler from '@tanstack/react-start/server-entry'
import { paraglideMiddleware } from './paraglide/server'
import { publicRequestUrl } from './lib/public-request'
import { readEnvironment } from './env'
import { resolveDeployment } from './lib/deployment-policy'

export default {
  async fetch(request: Request): Promise<Response> {
    const environment = readEnvironment(process.env)
    const publicUrl = publicRequestUrl(request, environment.TRUST_PROXY)
    const response = await paraglideMiddleware(
      request,
      () => handler.fetch(request),
      {
        redirect: 'navigation',
        effectiveRequestUrl: publicUrl ?? request.url,
      },
    )
    // Negotiated redirects bypass Start's document middleware: never let a
    // shared cache remember one browser's cookie/header-selected language.
    if (response.status >= 300 && response.status < 400) {
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'private, no-store')
      headers.set('Vary', 'Cookie, Accept-Language')
      if (!resolveDeployment(environment.ORIGIN, publicUrl).publish)
        headers.set('X-Robots-Tag', 'noindex')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  },
}
