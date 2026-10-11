import type { Page, Request } from '@playwright/test'

export type ObservedRequest = {
  url: string
  method: string
  body: string | null
}

export class RequestObserver {
  constructor(private readonly page: Page) {}

  observeRequests() {
    const observed: ObservedRequest[] = []
    const record = (request: Request) => {
      observed.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
      })
    }
    this.page.on('request', record)

    return {
      snapshot: () => observed.map((request) => ({ ...request })),
    }
  }
}
