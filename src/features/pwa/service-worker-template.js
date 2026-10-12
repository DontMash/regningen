const APP_VERSION = __APP_VERSION__
const ASSET_REVISION = __ASSET_REVISION__
const RELEASE_INFO = __RELEASE_INFO__
const PRECACHE_URLS = __PRECACHE_URLS__
const DOCUMENT_PATHS = ['/', '/invoice', '/business-profile']
const APP_CACHE_PREFIX = 'regningen-pwa-assets-'
const CACHE_NAME = `${APP_CACHE_PREFIX}${APP_VERSION}-${ASSET_REVISION}`
const pendingPreparations = new Map()
let activeCoordination = null

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...PRECACHE_URLS, ...DOCUMENT_PATHS]))
      .catch(async (error) => {
        await caches.delete(CACHE_NAME)
        throw error
      }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(
            (name) => name.startsWith(APP_CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    const route = DOCUMENT_PATHS.includes(url.pathname)
      ? url.pathname
      : url.pathname.replace(/\/$/, '') || '/'
    if (!DOCUMENT_PATHS.includes(route)) return

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const key = new URL(route, self.registration.scope).href
        const cached = await cache.match(key)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok) await cache.put(key, response.clone())
        return response
      })(),
    )
    return
  }

  if (!PRECACHE_URLS.includes(url.pathname)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })(),
  )
})

function postToClient(client, message) {
  try {
    client?.postMessage(message)
  } catch {
    // A tab may close after it was enumerated for update coordination.
  }
}

function requestWorker(worker, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => {
      channel.port1.close()
      reject(new Error('Die vorbereitete Version antwortet nicht.'))
    }, 3000)
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(event.data)
    }
    worker.postMessage(message, [channel.port2])
  })
}

async function readWorkerRelease(worker) {
  const response = await requestWorker(worker, { type: 'GET_RELEASE_INFO' })
  return response?.release ?? null
}

function waitForClientPreparation(
  requestId,
  targetVersion,
  clientIds,
  clients,
) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), 12000)
    const preparation = {
      expected: clientIds,
      results: new Map(),
      finish,
    }

    function finish(completed) {
      clearTimeout(timeout)
      pendingPreparations.delete(requestId)
      resolve(
        completed &&
          [...clientIds].every((clientId) => preparation.results.get(clientId)),
      )
    }

    pendingPreparations.set(requestId, preparation)
    for (const client of clients) {
      postToClient(client, {
        type: 'PREPARE_UPDATE',
        requestId,
        targetVersion,
      })
    }
    if (clientIds.size === 0) finish(true)
  })
}

async function deferUpdate(requester, requestId, clients, reason) {
  for (const client of clients) {
    postToClient(client, { type: 'ABORT_UPDATE', requestId })
  }
  for (const client of clients) {
    postToClient(client, { type: 'UPDATE_DEFERRED', requestId, reason })
  }
  if (!clients.some((client) => client.id === requester.id)) {
    postToClient(requester, { type: 'UPDATE_DEFERRED', requestId, reason })
  }
}

async function coordinateUpdate(requester, requestId, targetVersion) {
  const waitingWorker = self.registration.waiting
  if (!waitingWorker) {
    postToClient(requester, {
      type: 'UPDATE_DEFERRED',
      requestId,
      reason:
        'Die vorbereitete Version ist nicht mehr verfügbar. Bitte später erneut versuchen.',
    })
    return
  }

  let waitingRelease
  try {
    waitingRelease = await readWorkerRelease(waitingWorker)
  } catch {
    waitingRelease = null
  }
  if (!waitingRelease || waitingRelease.version !== targetVersion) {
    postToClient(requester, {
      type: 'UPDATE_DEFERRED',
      requestId,
      reason:
        'Die bereitstehende Version hat sich geändert. Bitte prüfe die Versionshinweise erneut.',
    })
    return
  }

  let clients
  try {
    clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: false,
    })
  } catch {
    postToClient(requester, {
      type: 'UPDATE_DEFERRED',
      requestId,
      reason:
        'Die geöffneten Fenster konnten nicht sicher geprüft werden. Bitte später erneut versuchen.',
    })
    return
  }

  try {
    const clientIds = new Set(clients.map((client) => client.id))
    const prepared = await waitForClientPreparation(
      requestId,
      targetVersion,
      clientIds,
      clients,
    )

    let currentWaitingRelease
    try {
      currentWaitingRelease = await readWorkerRelease(self.registration.waiting)
    } catch {
      currentWaitingRelease = null
    }
    const sameWaitingRelease =
      self.registration.waiting === waitingWorker &&
      currentWaitingRelease?.version === targetVersion
    // Check again after the asynchronous release check. The waiting worker
    // also verifies these IDs immediately before calling skipWaiting.
    const clientsAfterPreparation = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: false,
    })
    const sameClients =
      clientIds.size === clientsAfterPreparation.length &&
      clientsAfterPreparation.every((client) => clientIds.has(client.id))

    if (!prepared || !sameClients || !sameWaitingRelease) {
      await deferUpdate(
        requester,
        requestId,
        clients,
        !prepared
          ? 'Ein geöffnetes Fenster konnte seine Eingaben nicht sicher vorbereiten. Alle Fenster bleiben geöffnet.'
          : !sameClients
            ? 'Die geöffneten Fenster haben sich während der Vorbereitung geändert. Bitte später erneut versuchen.'
            : 'Die vorbereitete Version hat sich geändert. Bitte prüfe die Versionshinweise erneut.',
      )
      return
    }

    const activation = await requestWorker(waitingWorker, {
      type: 'ACTIVATE_NOW',
      requestId,
      targetVersion,
      clientIds: [...clientIds],
    })
    if (activation?.accepted !== true) {
      await deferUpdate(
        requester,
        requestId,
        clients,
        'Die geöffneten Fenster haben sich während der Vorbereitung geändert. Bitte später erneut versuchen.',
      )
    }
  } catch {
    await deferUpdate(
      requester,
      requestId,
      clients,
      'Die geöffneten Fenster konnten nicht sicher vorbereitet werden. Bitte später erneut versuchen.',
    )
  }
}

self.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message.type !== 'string') return

  if (message.type === 'GET_RELEASE_INFO') {
    event.ports?.[0]?.postMessage({ release: RELEASE_INFO })
    return
  }

  if (message.type === 'GET_STATUS') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      offlineReady: true,
    })
    return
  }

  if (message.type === 'ACTIVATE_NOW') {
    event.waitUntil(
      (async () => {
        if (
          message.targetVersion !== APP_VERSION ||
          !Array.isArray(message.clientIds)
        ) {
          event.ports?.[0]?.postMessage({ accepted: false })
          return
        }
        // A waiting worker does not control the old windows itself.
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        const expectedIds = new Set(message.clientIds)
        if (
          expectedIds.size !== clients.length ||
          clients.some((client) => !expectedIds.has(client.id))
        ) {
          event.ports?.[0]?.postMessage({ accepted: false })
          return
        }
        for (const client of clients) {
          postToClient(client, {
            type: 'UPDATE_ACCEPTED',
            requestId: message.requestId,
            targetVersion: APP_VERSION,
          })
        }
        // No asynchronous work between the last client check and activation.
        const activation = self.skipWaiting()
        event.ports?.[0]?.postMessage({ accepted: true })
        await activation
      })().catch(() => event.ports?.[0]?.postMessage({ accepted: false })),
    )
    return
  }

  if (message.type === 'PREPARE_RESULT') {
    const source = event.source
    const preparation = pendingPreparations.get(message.requestId)
    if (!preparation || !source?.id || !preparation.expected.has(source.id)) {
      return
    }
    preparation.results.set(source.id, message.prepared === true)
    if (preparation.results.size === preparation.expected.size) {
      preparation.finish(true)
    }
    return
  }

  if (message.type === 'PREPARE_UPDATE') {
    const source = event.source
    if (!source || !('id' in source)) return

    if (activeCoordination) {
      if (activeCoordination.targetVersion === message.targetVersion) {
        postToClient(source, {
          type: 'UPDATE_JOINED',
          requestId: message.requestId,
          activeRequestId: activeCoordination.requestId,
          targetVersion: activeCoordination.targetVersion,
        })
      } else {
        postToClient(source, {
          type: 'UPDATE_DEFERRED',
          requestId: message.requestId,
          reason:
            'Eine andere Version wird bereits vorbereitet. Bitte versuche es später erneut.',
        })
      }
      return
    }

    const coordination = {
      requestId: message.requestId,
      targetVersion: message.targetVersion,
    }
    activeCoordination = coordination
    event.waitUntil(
      coordinateUpdate(
        source,
        message.requestId,
        message.targetVersion,
      ).finally(() => {
        if (activeCoordination === coordination) activeCoordination = null
      }),
    )
  }
})
