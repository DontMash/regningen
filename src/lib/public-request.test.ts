import { describe, expect, it } from 'vitest'
import { publicRequestUrl } from './public-request'

const forwarding = {
  'x-forwarded-host': 'public.example',
  'x-forwarded-proto': 'https',
}

// Supplement delivered-response acceptance with the shared protocol contract's
// edge cases. These tests do not establish real TLS or authenticate a proxy.
describe('establishing a public request URL', () => {
  it('preserves the actual direct request and ignores forwarding without opt-in', () => {
    const request = new Request(
      'http://backend.example:8080/invoice?example=1',
      { headers: forwarding },
    )
    expect(publicRequestUrl(request, false)).toBe(
      'http://backend.example:8080/invoice?example=1',
    )
    expect(
      publicRequestUrl(new Request('https://public.example/settings'), false),
    ).toBe('https://public.example/settings')
    expect(publicRequestUrl(new Request('http://backend.example/'), true)).toBe(
      'http://backend.example/',
    )
    expect(
      publicRequestUrl(new Request('ftp://backend.example/'), false),
    ).toBeUndefined()
  })

  it('reconstructs only a trusted single public host/protocol pair', () => {
    expect(
      publicRequestUrl(
        new Request('http://backend.example/invoice?q=1', {
          headers: forwarding,
        }),
        true,
      ),
    ).toBe('https://public.example/invoice?q=1')
    expect(
      publicRequestUrl(
        new Request('http://backend.example/', {
          headers: { ...forwarding, 'x-forwarded-host': '[::1]:8443' },
        }),
        true,
      ),
    ).toBe('https://[::1]:8443/')
    expect(
      publicRequestUrl(
        new Request('http://backend.example/', {
          headers: { ...forwarding, 'x-forwarded-proto': 'http' },
        }),
        true,
      ),
    ).toBe('http://public.example/')
  })

  it.each([
    { 'x-forwarded-proto': 'https' },
    { 'x-forwarded-host': 'public.example' },
    { ...forwarding, 'x-forwarded-host': '' },
    { ...forwarding, 'x-forwarded-proto': '' },
    { ...forwarding, 'x-forwarded-host': 'public.example, other.example' },
    { ...forwarding, 'x-forwarded-proto': 'https, http' },
    { ...forwarding, 'x-forwarded-proto': 'ftp' },
    { ...forwarding, 'x-forwarded-host': 'user@public.example' },
    { ...forwarding, 'x-forwarded-host': 'public.example/path' },
    { ...forwarding, 'x-forwarded-host': 'public.example:99999' },
  ] as Array<Record<string, string>>)(
    'rejects malformed or incomplete trusted forwarding: %j',
    (headers) => {
      expect(
        publicRequestUrl(
          new Request('http://backend.example/', { headers }),
          true,
        ),
      ).toBeUndefined()
    },
  )

  it('never interprets a protocol-relative request path as the public hostname', () => {
    expect(
      publicRequestUrl(
        new Request('http://backend.example//other.example/invoice?example=1', {
          headers: forwarding,
        }),
        true,
      ),
    ).toBe('https://public.example//other.example/invoice?example=1')
  })
})
