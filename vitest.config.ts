import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./tests/support/vitest/pwa-register.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/scenarios/**/*.test.ts',
      'tests/support/playwright/vitals-metrics.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/components/ui/**',
        'src/routeTree.gen.ts',
        'src/paraglide/**',
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/unit',
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})
