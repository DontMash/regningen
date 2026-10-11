import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/scenarios/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/components/ui/**',
        'src/routeTree.gen.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/unit',
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
})
