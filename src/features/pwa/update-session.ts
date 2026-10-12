export const UPDATE_ACKNOWLEDGMENT_KEY = 'regningen.pwa.update-acknowledgment'

export type UpdateAcknowledgmentStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'setItem'
>

export function consumeUpdateAcknowledgment(
  storage: UpdateAcknowledgmentStorage,
  runningVersion: string,
) {
  const targetRelease = storage.getItem(UPDATE_ACKNOWLEDGMENT_KEY)
  if (targetRelease === null) return false

  storage.removeItem(UPDATE_ACKNOWLEDGMENT_KEY)
  return targetRelease === runningVersion
}
