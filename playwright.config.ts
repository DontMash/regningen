import { env } from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/*.vitals.spec.ts',
  fullyParallel: true,
  // Browser journeys and isolated production builds share CPU and memory.
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // Existing journeys use German; detection scenarios override this explicitly.
    locale: 'de-DE',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !env.CI,
    timeout: 120_000,
  },
})
