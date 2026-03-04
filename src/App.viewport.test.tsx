// ABOUTME: Verifies App keeps shell height synced with visual viewport changes.
// ABOUTME: Guards against mobile bottom-nav jump and unreachable top controls regressions.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

interface MutableVisualViewport {
  height: number
  offsetTop: number
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

describe('App visual viewport sync', () => {
  const originalViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  const originalDivScrollTo = HTMLDivElement.prototype.scrollTo
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--app-shell-height')
    HTMLDivElement.prototype.scrollTo = (() => undefined) as typeof HTMLDivElement.prototype.scrollTo
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    root = null
    host?.remove()
    host = null
    document.documentElement.style.removeProperty('--app-shell-height')

    if (originalViewportDescriptor) {
      Object.defineProperty(window, 'visualViewport', originalViewportDescriptor)
    } else {
      delete (window as { visualViewport?: VisualViewport }).visualViewport
    }

    HTMLDivElement.prototype.scrollTo = originalDivScrollTo
  })

  it('updates app shell height variable from visual viewport changes', async () => {
    const listeners = new Map<string, EventListener>()
    const viewport: MutableVisualViewport = {
      height: 700,
      offsetTop: 0,
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type) => {
        listeners.delete(type)
      },
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 632
    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('632px')
  })
})
