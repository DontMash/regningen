import 'react'

declare module 'react' {
  interface MetaHTMLAttributes<T> {
    /** TanStack Router's native, safely serialized JSON-LD head descriptor. */
    'script:ld+json'?: Record<string, unknown>
  }
}
