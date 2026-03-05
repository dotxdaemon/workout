// ABOUTME: Caches the app shell for offline support and handles fetch strategies by request type.
// ABOUTME: Keeps UI assets fresh while preserving offline fallback for same-origin requests.
const CACHE_NAME = 'workout-shell-v5'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker'
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request)
    const cache = await caches.open(CACHE_NAME)
    await cache.put('/index.html', networkResponse.clone())
    return networkResponse
  } catch {
    const cachedResponse = await caches.match('/index.html')
    return cachedResponse || Response.error()
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request)
  if (cachedResponse) {
    return cachedResponse
  }

  const networkResponse = await fetch(request)
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, networkResponse.clone())
  return networkResponse
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request)
    const cache = await caches.open(CACHE_NAME)
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    const cachedResponse = await caches.match(request)
    return cachedResponse || Response.error()
  }
}
