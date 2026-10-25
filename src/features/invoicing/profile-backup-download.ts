import * as m from '@/paraglide/messages'
import { ProfileFailure } from './profile-contract'

/** Initiation only; the browser owns completion of the actual download. */
export function downloadProfileBackup(contents: string, filename: string) {
  let url: string | undefined
  let link: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(
      new Blob([contents], { type: 'application/json' }),
    )
    link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
  } catch (cause) {
    if (
      cause instanceof DOMException ||
      (cause instanceof TypeError && typeof URL.createObjectURL !== 'function')
    ) {
      throw new ProfileFailure('backup', m.profile_backup_export_failed(), {
        cause,
      })
    }
    throw cause
  } finally {
    link?.remove()
    if (url !== undefined) {
      const resource = url
      window.setTimeout(() => URL.revokeObjectURL(resource), 60_000)
    }
  }
}
