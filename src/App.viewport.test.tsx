// ABOUTME: Verifies App keeps shell height synced with visual viewport changes.
// ABOUTME: Guards against mobile bottom-nav jump and unreachable top controls regressions.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

interface MutableVisualViewport {
  height: number
  offsetTop: number
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

describe('App visual viewport sync', () => {
  const originalViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')
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

    if (originalInnerHeightDescriptor) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeightDescriptor)
    }

    HTMLDivElement.prototype.scrollTo = originalDivScrollTo
  })

  it('keeps shell height pinned when non-editing viewport ticks are smaller', async () => {
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
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 632
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 632,
    })
    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')
  })

  it('applies visualViewport offsetTop when not editing text', async () => {
    const viewport: MutableVisualViewport = {
      height: 700,
      offsetTop: 120,
      addEventListener: () => {},
      removeEventListener: () => {},
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')
  })

  it('keeps shell height stable while editing a text field', async () => {
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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')
    input.remove()
  })

  it('restores shell height when editing ends and viewport normalizes', async () => {
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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 700
    viewport.offsetTop = 120

    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')

    await act(async () => {
      resizeListener?.(new Event('resize'))
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')
    input.remove()
  })

  it('keeps shell height pinned while blur fires before viewport restoration', async () => {
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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')
    input.remove()
  })

  it('keeps shell height pinned after blur when viewport remains shrunken across repeated ticks', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(0)

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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    })

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    nowSpy.mockReturnValue(700)
    await act(async () => {
      resizeListener?.(new Event('resize'))
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')
    input.remove()
    nowSpy.mockRestore()
  })

  it('keeps shell pinned until delayed recovery ticks arrive', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(0)

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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    })

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    await act(async () => {
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    nowSpy.mockReturnValue(1000)
    await act(async () => {
      resizeListener?.(new Event('resize'))
    })
    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 700
    viewport.offsetTop = 120
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    await act(async () => {
      resizeListener?.(new Event('resize'))
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')
    input.remove()
    nowSpy.mockRestore()
  })

  it('restores shell on a single strong recovery tick', async () => {
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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    })

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()

    await act(async () => {
      resizeListener?.(new Event('resize'))
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 700
    viewport.offsetTop = 120
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    await act(async () => {
      resizeListener?.(new Event('resize'))
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')
    input.remove()
  })

  it('keeps shell pinned after blur recovery if a later non-editing tick shrinks viewport', async () => {
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

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const input = document.createElement('input')
    document.body.append(input)

    await act(async () => {
      root?.render(<App />)
    })

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeDefined()
    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    await act(async () => {
      input.focus()
    })

    viewport.height = 500
    viewport.offsetTop = 0
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    })

    await act(async () => {
      resizeListener?.(new Event('resize'))
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('700px')

    viewport.height = 700
    viewport.offsetTop = 120
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')

    viewport.height = 640
    viewport.offsetTop = 0
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 520,
    })

    await act(async () => {
      resizeListener?.(new Event('resize'))
    })

    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('820px')
    input.remove()
  })
})
