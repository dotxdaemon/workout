// ABOUTME: Verifies startup side effects that must happen before the app renders.
// ABOUTME: Guards against first-paint regressions for persisted theme preferences.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderSpy = vi.fn()
const createRootSpy = vi.fn(() => ({
  render: renderSpy,
}))
const registerAppServiceWorkerSpy = vi.fn()

vi.mock('react-dom/client', () => ({
  createRoot: createRootSpy,
}))

vi.mock('./App', () => ({
  default: () => null,
}))

vi.mock('./lib/serviceWorker', () => ({
  registerAppServiceWorker: registerAppServiceWorkerSpy,
}))

describe('main startup', () => {
  beforeEach(() => {
    vi.resetModules()
    renderSpy.mockReset()
    createRootSpy.mockClear()
    registerAppServiceWorkerSpy.mockClear()
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('applies the saved theme before the first render', async () => {
    localStorage.setItem(
      'workout-tracker.preferences.v1',
      JSON.stringify({
        defaultUnit: 'lb',
        defaultWeightIncrement: 5,
        restTimerEnabled: true,
        restSeconds: 90,
        theme: 'light',
      }),
    )

    renderSpy.mockImplementation(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    await import('./main')

    expect(createRootSpy).toHaveBeenCalledTimes(1)
    expect(renderSpy).toHaveBeenCalledTimes(1)
    expect(registerAppServiceWorkerSpy).toHaveBeenCalledTimes(1)
  })
})
