/** Validated, build-local notice data shared with the presentation. */
export type NoticeEntry = {
  id: string
  name: string
  version: string
  license: string
  kind: 'software' | 'font' | 'copied-source' | 'generated'
  texts: Array<{ file: string; text: string }>
}

export type NoticeData = {
  revision: string
  project: {
    name: string
    version: string
    license: string
    copyright: string
    text: string
  }
  entries: NoticeEntry[]
}
