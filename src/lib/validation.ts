import { z } from 'zod'

// Use Zod's supported interpreter, not its optional new Function fast path.
// Configure before creating schemas so normal validation never attempts eval.
z.config({ jitless: true })

export { z }
