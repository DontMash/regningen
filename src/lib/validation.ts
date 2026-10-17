import { z } from './zod'
import * as m from '@/paraglide/messages'

// Use Zod's supported interpreter, not its optional new Function fast path.
// Configure before creating schemas so normal validation never attempts eval.
z.config({
  jitless: true,
  customError: (issue) => {
    if (issue.code === 'too_big' && issue.origin === 'string')
      return m.common_too_long({ maximum: String(issue.maximum) })
    if (issue.code === 'too_small' && issue.origin === 'string')
      return m.common_too_short({ minimum: String(issue.minimum) })
    if (issue.code === 'invalid_type') return m.common_invalid_type()
    return m.common_invalid()
  },
})

export { z }
