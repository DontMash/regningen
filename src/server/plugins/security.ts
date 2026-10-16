import { definePlugin } from 'nitro'
import {
  contentSecurityPolicy,
  securityHeaders,
} from '../../lib/security-policy'
import { publicRequestUrl } from '../../lib/public-request'

export default definePlugin((nitro) => {
  nitro.hooks.hook('response', (response, event) => {
    const url = publicRequestUrl(event.req, process.env.TRUST_PROXY === 'true')
    securityHeaders(url, process.env.HSTS_STAGE).forEach((value, name) => {
      response.headers.set(name, value)
    })
    // Start supplies its request-local policy before rendering. Never replace
    // it with a late nonce: streamed or cached HTML must keep its authorization.
    if (!response.headers.has('Content-Security-Policy')) {
      response.headers.set('Content-Security-Policy', contentSecurityPolicy())
    }
  })
})
