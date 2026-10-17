import { readFile, readdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { PwaDeployment } from '../support/playwright/pwa-deployment'
import { inspectHtml, readHttp } from '../support/playwright/http-documents'

const forwardedHttps = {
  'x-forwarded-host': 'public.example',
  'x-forwarded-proto': 'https',
}
const invalidSettings = [
  { ORIGIN: 'https://example.com/path' },
  { TRUST_PROXY: 'TRUE' },
  { HSTS_STAGE: 'invalid' },
]
const canaryOrigin = 'https://environment-canary.example'

test('an invalid supplied setting fails build and development startup with the setting named', async () => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create({
    build: false,
    updates: false,
  })
  try {
    for (const environment of invalidSettings) {
      const setting = Object.keys(environment)[0]
      const build = await deployment.build(environment)
      expect(build.exitCode, build.output).toBeGreaterThan(0)
      expect(build.output).toContain(setting)
      const server = await deployment.serve('dev', { environment })
      expect(server.ready, server.output).toBe(false)
      expect(server.exitCode, server.output).toBeGreaterThan(0)
      expect(server.output).toContain(setting)
    }
  } finally {
    await deployment.dispose()
  }
})

test('build honors nonempty and empty shell overrides of malformed file settings', async () => {
  test.setTimeout(240_000)
  const deployment = await PwaDeployment.create({
    build: false,
    updates: false,
  })
  try {
    await deployment.setEnvironmentFiles({
      '.env': 'ORIGIN=https://base.example\nTRUST_PROXY=false\nHSTS_STAGE=off',
      '.env.production.local':
        'ORIGIN=invalid\nTRUST_PROXY=invalid\nHSTS_STAGE=invalid',
    })
    const fileOnly = await deployment.build()
    expect(fileOnly.exitCode, fileOnly.output).toBeGreaterThan(0)
    expect(fileOnly.output).toContain('Invalid deployment configuration:')
    for (const environment of [
      {
        ORIGIN: 'https://shell-build.example',
        TRUST_PROXY: 'false',
        HSTS_STAGE: 'off',
      },
      { ORIGIN: '', TRUST_PROXY: '', HSTS_STAGE: '' },
    ]) {
      const build = await deployment.build(environment)
      expect(build.exitCode, build.output).toBe(0)
    }
  } finally {
    await deployment.dispose()
  }
})

test.describe('loaded deployment configuration', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 })
  let deployment: PwaDeployment

  test.beforeAll(async () => {
    deployment = await PwaDeployment.create({ build: false, updates: false })
    // Lower-priority malformed inputs must not be validated before the selected
    // production-local override is loaded. Files never come from the checkout.
    await deployment.setEnvironmentFiles({
      '.env': 'ORIGIN=invalid\nTRUST_PROXY=invalid\nHSTS_STAGE=invalid',
      '.env.production.local': `ORIGIN=${canaryOrigin}\nTRUST_PROXY=false\nHSTS_STAGE=off`,
    })
    const build = await deployment.build()
    expect(build.exitCode, build.output).toBe(0)
  })

  test.afterAll(async () => {
    await deployment.dispose()
  })

  test('malformed runtime settings fail production and preview before static readiness', async () => {
    await deployment.setEnvironmentFiles({})
    for (const command of ['production', 'preview'] as const) {
      for (const environment of invalidSettings) {
        const server = await deployment.serve(command, { environment })
        expect(server.ready, server.output).toBe(false)
        expect(server.exitCode, server.output).toBeGreaterThan(0)
        expect(server.output).toContain(Object.keys(environment)[0])
      }
    }
  })

  test('development and preview load base, local and selected-mode overrides consistently', async () => {
    for (const command of ['dev', 'preview'] as const) {
      const mode = command === 'dev' ? 'development' : 'production'
      const files: Record<string, string> = {
        '.env':
          'ORIGIN=https://base.example\nTRUST_PROXY=true\nHSTS_STAGE=one-day',
        // This is not an implicit extra layer, even in production preview.
        '.env.preview':
          'ORIGIN=invalid\nTRUST_PROXY=invalid\nHSTS_STAGE=invalid',
      }
      for (const [filename, origin, stage, duration] of [
        ['.env', 'https://base.example', 'one-day', '86400'],
        ['.env.local', 'https://local.example', 'one-week', '604800'],
        [`.env.${mode}`, 'https://mode.example', 'one-year', '31536000'],
        [`.env.${mode}.local`, 'https://mode-local.example', 'reset', '0'],
      ]) {
        files[filename] =
          `ORIGIN=${origin}\nTRUST_PROXY=true\nHSTS_STAGE=${stage}`
        await deployment.setEnvironmentFiles(files)
        const server = await deployment.serve(command)
        expect(server.ready, server.output).toBe(true)
        await expectConfiguration(
          deployment,
          origin,
          command === 'dev' ? undefined : `max-age=${duration}`,
          true,
        )
      }
      const shell = await deployment.serve(command, {
        environment: {
          ORIGIN: 'https://shell.example',
          TRUST_PROXY: 'false',
          HSTS_STAGE: 'off',
        },
      })
      expect(shell.ready, shell.output).toBe(true)
      await expectConfiguration(deployment, 'https://shell.example', undefined)
      const empty = await deployment.serve(command, {
        environment: { ORIGIN: '', TRUST_PROXY: '', HSTS_STAGE: '' },
      })
      expect(empty.ready, empty.output).toBe(true)
      await expectConfiguration(deployment, undefined, undefined)
    }
  })

  test('explicit mode selection applies to development, build and preview', async () => {
    await deployment.setEnvironmentFiles({
      '.env': 'ORIGIN=invalid\nTRUST_PROXY=invalid\nHSTS_STAGE=invalid',
      '.env.custom':
        'ORIGIN=https://custom.example\nTRUST_PROXY=true\nHSTS_STAGE=one-day',
      '.env.custom.local': 'HSTS_STAGE=reset',
    })
    for (const command of ['dev', 'preview'] as const) {
      const server = await deployment.serve(command, { mode: 'custom' })
      expect(server.ready, server.output).toBe(true)
      await expectConfiguration(
        deployment,
        'https://custom.example',
        command === 'dev' ? undefined : 'max-age=0',
        true,
      )
    }
    const build = await deployment.build({}, 'custom')
    expect(build.exitCode, build.output).toBe(0)
  })

  test('direct production ignores incidental files but honors explicit Node loading and shell precedence', async () => {
    await deployment.setEnvironmentFiles(
      {
        '.env':
          'ORIGIN=https://runtime-file.example\nTRUST_PROXY=true\nHSTS_STAGE=reset',
      },
      'runtime',
    )
    let server = await deployment.serve('production')
    expect(server.ready, server.output).toBe(true)
    await expectConfiguration(deployment, undefined, undefined)

    server = await deployment.serve('production', { envFile: '.env' })
    expect(server.ready, server.output).toBe(true)
    await expectConfiguration(
      deployment,
      'https://runtime-file.example',
      'max-age=0',
      true,
    )

    server = await deployment.serve('production', {
      envFile: '.env',
      environment: { ORIGIN: '', TRUST_PROXY: '', HSTS_STAGE: '' },
    })
    expect(server.ready, server.output).toBe(true)
    await expectConfiguration(deployment, undefined, undefined)
  })

  test('the build does not embed server settings or their validator in client JavaScript', async () => {
    const directory = deployment.artifactPath('a', 'public/assets')
    const files = (await readdir(directory)).filter((name) =>
      /\.m?js$/.test(name),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = await readFile(`${directory}/${file}`, 'utf8')
      expect(source).not.toContain(canaryOrigin)
      expect(source).not.toContain('https://custom.example')
      expect(source).not.toContain('Invalid deployment configuration:')
    }
  })
})

async function expectConfiguration(
  deployment: PwaDeployment,
  origin: string | undefined,
  hsts: string | undefined,
  publish = false,
) {
  const response = await readHttp(deployment.baseUrl, '/de', {
    ...forwardedHttps,
    'x-forwarded-host': origin ? new URL(origin).host : 'public.example',
  })
  expect(response.status, response.body.toString()).toBe(200)
  const document = inspectHtml(response.body.toString())
  expect(document.canonicals).toEqual(origin ? [`${origin}/de`] : [])
  expect(document.metas.robots).toEqual([
    publish ? 'index, follow' : 'noindex, follow',
  ])
  expect(response.headers['strict-transport-security']).toBe(hsts)
}
