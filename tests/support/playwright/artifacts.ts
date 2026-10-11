import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Download, Page } from '@playwright/test'

const standardFontDataUrl = `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`

export class ArtifactSupport {
  constructor(private readonly page: Page) {}

  async captureDownload(action: () => Promise<unknown>) {
    const download = this.page.waitForEvent('download')
    await action()
    return download
  }

  trackDownloads() {
    const filenames: string[] = []
    this.page.on('download', (download) =>
      filenames.push(download.suggestedFilename()),
    )
    return { snapshot: () => [...filenames] }
  }

  readText(download: Download) {
    return readDownloadedText(download)
  }

  readPdf(download: Download) {
    return readDownloadedPdf(download)
  }
}

export async function readDownloadedText(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('The downloaded file is not available.')
  return readFile(path, 'utf8')
}

export async function readDownloadedPdf(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('The downloaded PDF is not available.')

  const loadingTask = getDocument({
    data: new Uint8Array(await readFile(path)),
    standardFontDataUrl,
  })
  const pdf = await loadingTask.promise
  try {
    const pages: string[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      pages.push(
        content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
      )
    }
    return {
      pageCount: pdf.numPages,
      pages,
      text: pages.join('\n'),
    }
  } finally {
    await loadingTask.destroy()
  }
}
