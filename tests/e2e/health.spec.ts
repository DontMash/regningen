import { expect, test } from '@playwright/test'
import { PwaDeployment } from '../support/playwright/pwa-deployment'

test('development reports its manifest version without claiming a release commit', async () => {
  test.setTimeout(120_000)
  const deployment = await PwaDeployment.create({
    updates: false,
    build: false,
  })
  try {
    const server = await deployment.serve('dev', {
      environment: { RELEASE_BUILD: 'true', RELEASE_COMMIT: 'not-a-commit' },
    })
    expect(server.ready).toBe(true)
    const response = await fetch(`${deployment.baseUrl}/healthz`, {
      redirect: 'manual',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: deployment.version('a'),
      commit: null,
    })
  } finally {
    await deployment.dispose()
  }
})

test('operators can identify the built release without runtime relabeling', async () => {
  test.setTimeout(180_000)
  const deployment = await PwaDeployment.create({
    updateKind: 'configuration',
    updateEnvironment: {
      RELEASE_BUILD: 'true',
      RELEASE_COMMIT: 'abcdef1234567890abcdef1234567890abcdef12',
    },
    environment: {
      RELEASE_BUILD: 'true',
      RELEASE_COMMIT: '1234567890abcdef1234567890abcdef12345678',
    },
  })
  try {
    await deployment.deploy('a', {
      RELEASE_BUILD: 'true',
      RELEASE_COMMIT: 'invalid-runtime-input',
    })
    const response = await fetch(`${deployment.baseUrl}/healthz`, {
      headers: { 'Accept-Language': 'en', Cookie: 'regningen.locale=en' },
      redirect: 'manual',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    )
    expect(await response.json()).toEqual({
      version: deployment.version('a'),
      commit: '1234567890abcdef1234567890abcdef12345678',
    })

    await deployment.deploy('b', {
      RELEASE_BUILD: 'false',
      RELEASE_COMMIT: '1234567890abcdef1234567890abcdef12345678',
    })
    const updated = await fetch(`${deployment.baseUrl}/healthz`)
    expect(await updated.json()).toEqual({
      version: deployment.version('b'),
      commit: 'abcdef1234567890abcdef1234567890abcdef12',
    })
  } finally {
    await deployment.dispose()
  }
})
