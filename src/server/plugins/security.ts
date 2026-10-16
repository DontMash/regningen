import { definePlugin } from 'nitro'
import {
  contentSecurityPolicy,
  securityHeaders,
} from '../../lib/security-policy'
import { publicRequestUrl } from '../../lib/public-request'
import { readEnvironment } from '../../env'

export default definePlugin((nitro) => {
  // Synchronous initialization runs before the listener, including static assets.
  const environment = readEnvironment(process.env)
  nitro.hooks.hook('response', (response, event) => {
    const url = publicRequestUrl(event.req, environment.TRUST_PROXY)
    securityHeaders(url, environment.HSTS_STAGE).forEach((value, name) => {
      response.headers.set(name, value)
    })
    // Start supplies its request-local policy before rendering. Never replace
    // it with a late nonce: streamed or cached HTML must keep its authorization.
    if (!response.headers.has('Content-Security-Policy')) {
      response.headers.set('Content-Security-Policy', contentSecurityPolicy())
    }
  })
})
