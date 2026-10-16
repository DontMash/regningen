import { createEnv } from '@t3-oss/env-core'
import { z } from './lib/validation.ts'
import { resolveDeployment } from './lib/visibility.ts'

/** Validate loaded server/build inputs; this module never loads environment files. */
export function readEnvironment(values: Record<string, string | undefined>) {
  return createEnv({
    server: {
      ORIGIN: z
        .string()
        .transform((value, context) => {
          const origin = resolveDeployment(value, undefined).canonicalOrigin
          if (origin !== null) return origin
          context.addIssue({
            code: 'custom',
            message:
              'Expected a bare HTTP(S) origin without credentials, path, query or fragment.',
          })
          return z.NEVER
        })
        .optional(),
      TRUST_PROXY: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
      HSTS_STAGE: z
        .enum(['off', 'one-day', 'one-week', 'one-year', 'reset'])
        .default('off'),
    },
    runtimeEnv: { ...values },
    isServer: true,
    emptyStringAsUndefined: true,
    onValidationError(issues) {
      throw new Error(
        `Invalid deployment configuration: ${issues
          .map((issue) => `${issue.path?.join('.')}: ${issue.message}`)
          .join('; ')}`,
      )
    },
  })
}
