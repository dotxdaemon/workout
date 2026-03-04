// ABOUTME: Registers the app service worker with aggressive update checks to avoid stale installed shells.
// ABOUTME: Triggers a one-time reload when a new controller takes over so viewport/layout fixes apply immediately.
interface AppLocationLike {
  reload: () => void
}

interface AppSessionStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface AppWindowLike {
  addEventListener: (type: 'load', listener: () => void | Promise<void>) => void
  location: AppLocationLike
  sessionStorage: AppSessionStorageLike
}

interface ServiceWorkerRegistrationLike {
  update?: () => Promise<unknown> | void
}

interface ServiceWorkerContainerLike {
  register: (
    scriptURL: string,
    options?: { updateViaCache?: ServiceWorkerUpdateViaCache },
  ) => Promise<ServiceWorkerRegistrationLike>
  addEventListener: (type: 'controllerchange', listener: () => void) => void
}

const RELOAD_FLAG_KEY = 'workout.sw.reloaded'

export function registerAppServiceWorker(
  appWindow: AppWindowLike,
  serviceWorker: ServiceWorkerContainerLike | undefined,
): void {
  if (!serviceWorker) {
    return
  }

  appWindow.addEventListener('load', () => {
    serviceWorker.addEventListener('controllerchange', () => {
      if (appWindow.sessionStorage.getItem(RELOAD_FLAG_KEY) === '1') {
        return
      }

      appWindow.sessionStorage.setItem(RELOAD_FLAG_KEY, '1')
      appWindow.location.reload()
    })

    void serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        await registration.update?.()
      })
      .catch(() => {})
  })
}
