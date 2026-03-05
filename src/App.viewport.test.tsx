// ABOUTME: Verifies App uses CSS-owned shell sizing without runtime viewport mutation.
// ABOUTME: Guards against regressions where App writes shell-height vars or registers viewport listeners.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

interface ListenerViewport {
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

describe('App shell layout model', () => {
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
    HTMLDivElement.prototype.scrollTo = originalDivScrollTo

    if (originalViewportDescriptor) {
      Object.defineProperty(window, 'visualViewport', originalViewportDescriptor)
      return
    }

    delete (window as { visualViewport?: VisualViewport }).visualViewport
  })

  it('does not write runtime shell-height custom property during input focus flow', async () => {
    const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty')

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
      input.blur()
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(setPropertySpy).not.toHaveBeenCalledWith('--app-shell-height', expect.any(String))
    expect(document.documentElement.style.getPropertyValue('--app-shell-height')).toBe('')

    input.remove()
    setPropertySpy.mockRestore()
  })

  it('does not register visualViewport listeners', async () => {
    const addEventListenerSpy = vi.fn()
    const removeEventListenerSpy = vi.fn()
    const viewport: ListenerViewport = {
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
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

    expect(addEventListenerSpy).not.toHaveBeenCalled()
    expect(removeEventListenerSpy).not.toHaveBeenCalled()
  })

  it('renders bottom navigation links for routines and settings', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root?.render(<App />)
    })

    const nav = host.querySelector('.bottom-nav')
    const links = Array.from(host.querySelectorAll('.bottom-nav a')).map((link) =>
      link.textContent?.trim(),
    )

    expect(nav).not.toBeNull()
    expect(links).toEqual(expect.arrayContaining(['Routines', 'Settings']))
  })
})
