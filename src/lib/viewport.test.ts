/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { calculateViewportBottomOffset } from './viewport'

describe('calculateViewportBottomOffset', () => {
  it('returns zero when visual viewport matches layout viewport', () => {
    expect(calculateViewportBottomOffset(812, 812, 0)).toBe(0)
  })

  it('returns a negative offset when visual viewport is pulled down', () => {
    expect(calculateViewportBottomOffset(812, 812, 96)).toBe(-96)
  })

  it('returns keyboard offset when visual viewport shrinks', () => {
    expect(calculateViewportBottomOffset(812, 500, 0)).toBe(312)
  })

  it('clamps non-finite offsets to zero', () => {
    expect(calculateViewportBottomOffset(Number.NaN, 900, 0)).toBe(0)
  })
})

describe('app layout css', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

  it('uses dynamic viewport height for the app shell without static svh lock', () => {
    const block = getRuleBlock(css, '.app-shell')

    expect(block).toContain('min-height: var(--app-shell-height, 100dvh)')
    expect(block).toContain('height: var(--app-shell-height, 100dvh)')
    expect(block).not.toContain('100svh')
    expect(block).not.toContain('max-height')
  })

  it('uses screen area as the only vertical scroll container', () => {
    const block = getRuleBlock(css, '.screen-area')

    expect(block).toContain('min-height: 0')
    expect(block).toContain('overflow-y: auto')
  })

  it('keeps bottom navigation in layout flow instead of sticky overlay', () => {
    const block = getRuleBlock(css, '.bottom-nav')

    expect(block).toContain('position: relative')
    expect(block).not.toContain('position: sticky')
  })

  it('pins edit actions at the top while scrolling edit cards', () => {
    const block = getRuleBlock(css, '.edit-actions-sticky')
    const hasBottomAnchor = /(^|\n)\s*bottom:\s*0;/.test(block)

    expect(block).toContain('position: sticky')
    expect(block).toContain('top: 0')
    expect(hasBottomAnchor).toBe(false)
  })
})

describe('service worker cache strategy', () => {
  const workerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

  it('uses network-first refresh for scripts and styles to avoid stale UI shell', () => {
    expect(workerSource).toContain("request.destination === 'script'")
    expect(workerSource).toContain("request.destination === 'style'")
    expect(workerSource).toContain('event.respondWith(networkFirst(request))')
  })
})

function getRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace('.', '\\.')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'))
  return match?.[1] ?? ''
}
