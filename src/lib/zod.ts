import { z } from 'zod'

// Pure validation is also used before Vite's localization plugin can run.
// Use the CSP-safe interpreter rather than Zod's optional new Function path.
z.config({ jitless: true })

export { z }
