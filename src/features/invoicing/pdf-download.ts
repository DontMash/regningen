import { InvoicePdfFailure } from './generation-contract'
import type { InvoicePdfDownload } from './generation-contract'

export const downloadInvoicePdf: InvoicePdfDownload = (bytes, filename) => {
  if (
    typeof document === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new InvoicePdfFailure('unavailable')
  }
  // Copy into an ArrayBuffer-backed view: a capability may return a view backed
  // by SharedArrayBuffer, which is not a browser BlobPart.
  const blob = new Blob([Uint8Array.from(bytes).buffer], {
    type: 'application/pdf',
  })
  let url: string
  try {
    url = URL.createObjectURL(blob)
  } catch (cause) {
    throw new InvoicePdfFailure('unavailable', { cause })
  }
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
