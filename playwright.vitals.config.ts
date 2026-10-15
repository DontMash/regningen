import { defineConfig } from '@playwright/test'

const origin = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.vitals.spec.ts',
  outputDir: '.vitals/test-results',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  reporter: [
    ['list'],
    ['./tests/support/playwright/vitals-reporter.ts'],
    ['html', { outputFolder: '.vitals/playwright-report', open: 'never' }],
  ],
  projects: [{ name: 'mobile' }, { name: 'desktop' }],
  use: { baseURL: origin },
  webServer: {
    command: 'pnpm build && node .output/server/index.mjs',
    url: origin,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ORIGIN: origin,
      TRUST_PROXY: 'false',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: '4173',
    },
  },
})
