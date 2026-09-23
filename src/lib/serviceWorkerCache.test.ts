// ABOUTME: Runs the real public/sw.js fetch handlers against an in-memory Cache API.
// ABOUTME: Guards that failed network responses never replace the cached offline shell or assets.
import { beforeEach, describe, expect, it } from 'vitest'
import serviceWorkerSource from '../../public/sw.js?raw'

const origin = 'https://workout.test'

type FetchListener = (event: {
  request: Request
  respondWith: (response: Promise<Response>) => void
}) => void

function createCacheStorage() {
  const stores = new Map<string, Map<string, Response>>()
  const toKey = (request: Request | string) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href

  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    return {
      put: async (request: Request | string, response: Response) => {
        store.set(toKey(request), response)
      },
      addAll: async () => {},
    }
  }

  return {
    open,
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
    match: async (request: Request | string) => {
      for (const store of stores.values()) {
        const response = store.get(toKey(request))
        if (response) return response.clone()
      }
      return undefined
    },
  }
}

function loadServiceWorker(networkResponses: Array<Response | Error>) {
  const listeners = new Map<string, FetchListener>()
  const caches = createCacheStorage()
  const fetch = async () => {
    const next = networkResponses.shift()
    if (!next || next instanceof Error) throw next ?? new Error('offline')
    return next
  }
  const self = {
    location: { origin },
    addEventListener: (type: string, listener: FetchListener) => {
      listeners.set(type, listener)
    },
  }

  new Function('self', 'caches', 'fetch', serviceWorkerSource)(self, caches, fetch)

  const request = async (path: string, init: { mode?: string; destination?: string }) => {
    let pending: Promise<Response> | undefined
    listeners.get('fetch')!({
      request: {
        method: 'GET',
        url: new URL(path, origin).href,
        mode: init.mode ?? 'no-cors',
        destination: init.destination ?? '',
      } as Request,
      respondWith: (response) => {
        pending = response
      },
    })
    return pending!
  }

  return { caches, request }
}

describe('service worker caching', () => {
  let shell: Response

  beforeEach(() => {
    shell = new Response('app shell', { status: 200 })
  })

  it('keeps the cached app shell for offline launch after a navigation returns an error', async () => {
    const worker = loadServiceWorker([
      shell,
      new Response('not found', { status: 404 }),
      new Error('offline'),
    ])

    await worker.request('/', { mode: 'navigate' })
    const failed = await worker.request('/missing', { mode: 'navigate' })
    expect(failed.status).toBe(404)

    const offline = await worker.request('/', { mode: 'navigate' })
    expect(offline.status).toBe(200)
    await expect(offline.text()).resolves.toBe('app shell')
  })

  it('refetches a cache-first asset whose earlier response was an error', async () => {
    const worker = loadServiceWorker([
      new Response('unavailable', { status: 503 }),
      new Response('icon', { status: 200 }),
    ])

    const failed = await worker.request('/icons/icon-192.png', { destination: 'image' })
    expect(failed.status).toBe(503)

    const retried = await worker.request('/icons/icon-192.png', { destination: 'image' })
    expect(retried.status).toBe(200)
    await expect(retried.text()).resolves.toBe('icon')
  })
})
