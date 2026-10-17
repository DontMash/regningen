import { request } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { JSDOM } from 'jsdom'

export function readHttp(
  baseUrl: string,
  path = '/de',
  headers: Record<string, string> = {},
) {
  return new Promise<{
    status: number
    headers: IncomingHttpHeaders
    body: Buffer
  }>((resolve, reject) => {
    // Node's HTTP client sends the supplied Host on the actual wire while the
    // connection still reaches our isolated loopback deployment.
    const outgoing = request(
      new URL(path, baseUrl),
      { headers },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.once('error', reject)
        response.once('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )
    outgoing.setTimeout(15_000, () => {
      outgoing.destroy(new Error(`HTTP request timed out: ${path}`))
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
}

export function inspectHtml(body: string) {
  const dom = new JSDOM(body)
  try {
    const document = dom.window.document
    const attributes = (selector: string, attribute: string) =>
      Array.from(document.head.querySelectorAll(selector), (element) =>
        element.getAttribute(attribute),
      )
    const metas: Record<string, string[]> = {}
    for (const element of document.head.querySelectorAll('meta')) {
      const name =
        element.getAttribute('name') ?? element.getAttribute('property')
      if (name) (metas[name] ??= []).push(element.getAttribute('content') ?? '')
    }
    return {
      language: document.documentElement.lang,
      title: document.title,
      metas,
      canonicals: attributes('link[rel="canonical"]', 'href'),
      alternates: Array.from(
        document.head.querySelectorAll('link[rel="alternate"][hreflang]'),
        (link) => ({
          language: link.getAttribute('hreflang'),
          href: link.getAttribute('href'),
        }),
      ),
      structuredData: Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
        (script): unknown => JSON.parse(script.textContent),
      ),
      mainText: (document.querySelector('main')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      headings: Array.from(
        document.querySelectorAll('main h1, main h2'),
        (heading) => heading.textContent.replace(/\s+/g, ' ').trim(),
      ),
      charset: attributes('meta[charset]', 'charset'),
      manifests: attributes('link[rel="manifest"]', 'href'),
      touchIcons: attributes('link[rel="apple-touch-icon"]', 'href'),
      stylesheets: attributes('link[rel="stylesheet"]', 'href'),
    }
  } finally {
    dom.window.close()
  }
}

export function inspectSitemap(body: string) {
  const dom = new JSDOM(body, { contentType: 'application/xml' })
  try {
    const document = dom.window.document
    const values = (name: string) =>
      Array.from(document.getElementsByTagName(name), (element) =>
        element.textContent.trim(),
      )
    return {
      root: document.documentElement.localName,
      namespace: document.documentElement.namespaceURI,
      locations: values('loc'),
      lastModified: values('lastmod'),
      priorities: values('priority'),
      changeFrequencies: values('changefreq'),
    }
  } finally {
    dom.window.close()
  }
}
