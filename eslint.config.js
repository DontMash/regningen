//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import { dependencyBoundaries } from './scripts/dependency-boundaries.mjs'

export default [
  ...tanstackConfig,
  dependencyBoundaries(import.meta.dirname),
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      // Instructional upstream showcase assets are not part of the application TS project.
      '.agents/skills/shadcn/assets/showcase/**',
      'eslint.config.js',
      'prettier.config.js',
      '.output/**',
      '.nitro/**',
      'playwright-report/**',
      'test-results/**',
      '.vitals/**',
      'src/paraglide/**',
      'project.inlang/.lix/**',
      'project.inlang/cache/**',
    ],
  },
]
