/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  advanceShellHeightState,
  calculateShellHeight,
  calculateViewportBottomOffset,
} from './viewport'

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

describe('calculateShellHeight', () => {
  it('includes visual viewport offset when not editing text', () => {
    const result = calculateShellHeight({
      visualHeight: 700,
      visualOffsetTop: 120,
      innerHeight: 700,
      previousStableHeight: 700,
      isTextEditing: false,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })

  it('freezes shell height while editing and keyboard shrink is detected', () => {
    const result = calculateShellHeight({
      visualHeight: 500,
      visualOffsetTop: 0,
      innerHeight: 700,
      previousStableHeight: 820,
      isTextEditing: true,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })

  it('returns normalized shell height after editing ends', () => {
    const result = calculateShellHeight({
      visualHeight: 700,
      visualOffsetTop: 120,
      innerHeight: 700,
      previousStableHeight: 820,
      isTextEditing: false,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })
})

describe('advanceShellHeightState', () => {
  it('keeps stable shell height while blur transition is active and viewport stays shrunken', () => {
    const first = advanceShellHeightState(
      {
        visualHeight: 500,
        visualOffsetTop: 0,
        innerHeight: 500,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(first.shellHeight).toBe(700)
    expect(first.state.isBlurTransitionActive).toBe(true)
    expect(first.state.recoveryPasses).toBe(0)
  })

  it('exits blur transition only after two recovered ticks', () => {
    const first = advanceShellHeightState(
      {
        visualHeight: 699,
        visualOffsetTop: 1,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(first.state.isBlurTransitionActive).toBe(true)
    expect(first.state.recoveryPasses).toBe(1)
    expect(first.shellHeight).toBe(700)

    const second = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      first.state,
    )

    expect(second.state.isBlurTransitionActive).toBe(false)
    expect(second.state.recoveryPasses).toBe(0)
    expect(second.shellHeight).toBe(820)
  })

  it('exits blur transition on one strong recovery tick', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.state.isBlurTransitionActive).toBe(false)
    expect(result.state.recoveryPasses).toBe(0)
    expect(result.shellHeight).toBe(820)
  })

  it('updates stable height in normal non-blur mode', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
    expect(result.state.isBlurTransitionActive).toBe(false)
  })

  it('does not shrink shell in normal mode when viewport briefly reports smaller height', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 640,
        visualOffsetTop: 0,
        innerHeight: 640,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase stable height from width shifts alone in portrait', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 640,
        visualOffsetTop: 0,
        innerHeight: 640,
        innerWidth: 520,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase while editing when keyboard shrink makes height smaller than width', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 320,
        visualOffsetTop: 0,
        innerHeight: 320,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: true,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase stable height from aspect flips without explicit orientation reset', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 390,
        visualOffsetTop: 0,
        innerHeight: 390,
        innerWidth: 844,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })
})

describe('app layout css', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

  it('uses a static percent-based app shell height model', () => {
    const block = getRuleBlock(css, '.app-shell')

    expect(block).toContain('min-height: 100%')
    expect(block).toContain('height: 100%')
    expect(block).not.toContain('100dvh')
    expect(block).not.toContain('--app-shell-height')
    expect(block).not.toContain('100svh')
    expect(block).not.toContain('max-height')
  })

  it('uses a dedicated two-row app shell for content and nav', () => {
    const block = getRuleBlock(css, '.app-shell')

    expect(block).toContain('display: grid')
    expect(block).toContain('grid-template-rows: minmax(0, 1fr) auto')
    expect(block).toContain('overflow: hidden')
  })

  it('locks document scrolling so screen-area owns vertical movement', () => {
    const block = getRuleBlock(css, 'body')

    expect(block).toContain('overflow: hidden')
  })

  it('uses screen-area as the vertical scroll owner', () => {
    const block = getRuleBlock(css, '.screen-area')

    expect(block).toContain('overflow-y: auto')
    expect(block).toContain('min-height: 0')
    expect(block).toContain('-webkit-overflow-scrolling: touch')
  })

  it('keeps bottom navigation in shell flow instead of viewport-fixed positioning', () => {
    const block = getRuleBlock(css, '.bottom-nav')

    expect(block).not.toContain('position: fixed')
    expect(block).not.toContain('left: 50%')
    expect(block).not.toContain('bottom: 0')
    expect(block).not.toContain('transform: translateX(-50%)')
  })

  it('caps safe-area insets so keyboard transitions cannot inflate nav height', () => {
    const rootBlock = getRuleBlock(css, ':root')
    const bottomNavBlock = getRuleBlock(css, '.bottom-nav')

    expect(rootBlock).toContain('--safe-area-bottom-capped:')
    expect(rootBlock).toContain('min(env(safe-area-inset-bottom), 36px)')
    expect(rootBlock).toContain('--bottom-nav-block-size:')
    expect(rootBlock).toContain('var(--safe-area-bottom-capped)')
    expect(bottomNavBlock).toContain('var(--safe-area-bottom-capped)')
  })

  it('pins edit actions at the top while scrolling edit cards', () => {
    const block = getRuleBlock(css, '.edit-actions-sticky')
    const hasBottomAnchor = /(^|\n)\s*bottom:\s*0;/.test(block)

    expect(block).toContain('position: sticky')
    expect(block).toContain('top: 0')
    expect(hasBottomAnchor).toBe(false)
  })

  it('keeps primary mobile controls at or above a 44px tap target', () => {
    const pillToggleBlock = getRuleBlock(css, '.pill-toggle__button')
    const saveButtonBlock = getRuleBlock(css, '.today-card__save-button')
    const historyButtonBlock = getRuleBlock(css, '.today-card__history-button')
    const compactFieldBlock = getRuleBlock(css, '.compact-field input')
    const stepperButtonBlock = getRuleBlock(css, '.stepper-button')
    const splitToggleBlock = getRuleBlock(css, '.split-toggle-small__button')
    const navLinkBlock = getRuleBlock(css, '.nav-link')

    expect(pillToggleBlock).toContain('min-height: 2.75rem')
    expect(saveButtonBlock).toContain('min-height: 44px')
    expect(historyButtonBlock).toContain('min-height: 44px')
    expect(compactFieldBlock).toContain('min-height: 44px')
    expect(stepperButtonBlock).toContain('min-height: 2.75rem')
    expect(splitToggleBlock).toContain('min-height: 2.75rem')
    expect(navLinkBlock).toContain('min-height: 2.75rem')
  })
})

describe('service worker cache strategy', () => {
  const workerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

  it('bumps shell cache revision and handles skip-waiting message for fast updates', () => {
    expect(workerSource).toContain("const CACHE_NAME = 'workout-shell-v5'")
    expect(workerSource).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(workerSource).toContain('self.skipWaiting()')
  })

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
