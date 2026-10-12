export interface UpdateParticipant {
  prepare: (targetRelease: string) => void | Promise<void>
  abort: (targetRelease: string) => void | Promise<void>
}

const participants = new Set<UpdateParticipant>()
const idleWaiters = new Set<() => void>()
let pendingOperations = 0

export function registerUpdateParticipant(participant: UpdateParticipant) {
  participants.add(participant)
  return () => participants.delete(participant)
}

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

async function waitForPendingOperations() {
  if (pendingOperations === 0) return

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let resolveIdle = () => {}
  const idle = new Promise<void>((resolve) => {
    resolveIdle = resolve
    idleWaiters.add(resolve)
  })
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(
            'Eine laufende Speicherung oder PDF-Erstellung ist noch nicht abgeschlossen.',
          ),
        ),
      8000,
    )
  })

  try {
    await Promise.race([idle, timeout])
  } finally {
    idleWaiters.delete(resolveIdle)
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export async function preparePwaUpdateParticipants(
  targetRelease: string,
  signal?: AbortSignal,
) {
  await waitForPendingOperations()
  signal?.throwIfAborted()
  for (const participant of participants) {
    signal?.throwIfAborted()
    await participant.prepare(targetRelease)
  }
  signal?.throwIfAborted()
}

export async function abortPwaUpdateParticipants(targetRelease: string) {
  for (const participant of participants) {
    try {
      await participant.abort(targetRelease)
    } catch {
      // Abort must continue through every participant even if cleanup is blocked.
    }
  }
}
