// ABOUTME: Verifies service-worker registration and update behaviors for stale-shell prevention.
// ABOUTME: Ensures controller changes trigger a one-time reload so installed app shells refresh quickly.
import { describe, expect, it, vi } from 'vitest'
import { registerAppServiceWorker } from './serviceWorker'

function createSessionStorage() {
  const values = new Map<string, string>()

  return {
    getItem(key: string): string | null {
      return values.has(key) ? values.get(key)! : null
    },
    setItem(key: string, value: string): void {
      values.set(key, value)
    },
    removeItem(key: string): void {
      values.delete(key)
    },
  }
}

describe('registerAppServiceWorker', () => {
  it('registers with updateViaCache=none and runs registration.update on load', async () => {
    const loadListeners: Array<() => void | Promise<void>> = []
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
    }
    const container = {
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
    }
    const sessionStorage = createSessionStorage()

    registerAppServiceWorker(
      {
        addEventListener: (type, listener) => {
          if (type === 'load') {
            loadListeners.push(listener)
          }
        },
        location: { reload: vi.fn() },
        sessionStorage,
      },
      container,
    )

    expect(loadListeners).toHaveLength(1)
    await loadListeners[0]()

    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      updateViaCache: 'none',
    })
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('reloads only once after controllerchange', async () => {
    const loadListeners: Array<() => void | Promise<void>> = []
    const controllerChangeListeners: Array<() => void> = []
    const location = {
      reload: vi.fn(),
    }
    const container = {
      register: vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) }),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') {
          controllerChangeListeners.push(listener)
        }
      },
    }
    const sessionStorage = createSessionStorage()

    registerAppServiceWorker(
      {
        addEventListener: (type, listener) => {
          if (type === 'load') {
            loadListeners.push(listener)
          }
        },
        location,
        sessionStorage,
      },
      container,
    )

    await loadListeners[0]()
    expect(controllerChangeListeners).toHaveLength(1)

    controllerChangeListeners[0]()
    controllerChangeListeners[0]()

    expect(location.reload).toHaveBeenCalledTimes(1)
  })
})
