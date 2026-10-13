const idleWaiters = new Set<() => void>()
let pendingOperations = 0

export function beginPwaCriticalOperation() {
  pendingOperations += 1
  let finished = false
  return () => {
    if (finished) return
    finished = true
    pendingOperations = Math.max(0, pendingOperations - 1)
    if (pendingOperations !== 0) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }
}

export async function runPwaCriticalOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const finish = beginPwaCriticalOperation()
  try {
    return await operation()
  } finally {
    finish()
  }
}

/** Wait locally before a plugin-requested page reload; this is not an activation veto. */
export async function waitForPwaCriticalOperations() {
  if (pendingOperations === 0) return
  await new Promise<void>((resolve) => idleWaiters.add(resolve))
}
