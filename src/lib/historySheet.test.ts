// ABOUTME: Verifies swipe-down close decisions used by the history bottom sheet.
// ABOUTME: Ensures drag behavior is predictable for scrollable history content.
import { describe, expect, it } from 'vitest'
import {
  applyHistorySheetOverlayLock,
  getHistorySheetDragOffset,
  shouldIgnoreHistorySheetBackdropClose,
  shouldAllowHistorySheetDrag,
  shouldCloseHistorySheetAfterDrag,
} from './historySheet'

describe('shouldAllowHistorySheetDrag', () => {
  it('allows drag when the list is scrolled to top and finger moves down', () => {
    expect(shouldAllowHistorySheetDrag(0, 24)).toBe(true)
  })

  it('blocks drag when content is still scrolled', () => {
    expect(shouldAllowHistorySheetDrag(8, 24)).toBe(false)
  })

  it('blocks drag when finger moves up', () => {
    expect(shouldAllowHistorySheetDrag(0, -16)).toBe(false)
  })
})

describe('getHistorySheetDragOffset', () => {
  it('returns positive distance for downward drag', () => {
    expect(getHistorySheetDragOffset(120, 220)).toBe(100)
  })

  it('clamps upward drag to zero', () => {
    expect(getHistorySheetDragOffset(220, 120)).toBe(0)
  })

  it('clamps non-finite values to zero', () => {
    expect(getHistorySheetDragOffset(Number.NaN, 120)).toBe(0)
  })
})

describe('shouldCloseHistorySheetAfterDrag', () => {
  it('closes when drag meets threshold', () => {
    expect(shouldCloseHistorySheetAfterDrag(96)).toBe(true)
  })

  it('stays open when drag is below threshold', () => {
    expect(shouldCloseHistorySheetAfterDrag(95)).toBe(false)
  })
})

describe('shouldIgnoreHistorySheetBackdropClose', () => {
  it('ignores backdrop close immediately after opening', () => {
    expect(shouldIgnoreHistorySheetBackdropClose(1000, 1050)).toBe(true)
  })

  it('allows backdrop close after the safety window', () => {
    expect(shouldIgnoreHistorySheetBackdropClose(1000, 1400)).toBe(false)
  })
})

describe('applyHistorySheetOverlayLock', () => {
  it('locks document scrolling without mutating the main content wrapper and hides bottom nav while sheet is open', () => {
    document.body.style.overflow = ''
    const screenArea = document.createElement('div')
    const bottomNav = document.createElement('nav')

    screenArea.style.overflow = 'auto'
    screenArea.style.touchAction = 'auto'
    bottomNav.style.visibility = ''
    bottomNav.style.pointerEvents = ''

    const restore = applyHistorySheetOverlayLock(bottomNav)

    expect(document.body.style.overflow).toBe('hidden')
    expect(screenArea.style.overflow).toBe('auto')
    expect(screenArea.style.touchAction).toBe('auto')
    expect(bottomNav.style.visibility).toBe('hidden')
    expect(bottomNav.style.pointerEvents).toBe('none')

    restore()

    expect(document.body.style.overflow).toBe('')
    expect(screenArea.style.overflow).toBe('auto')
    expect(screenArea.style.touchAction).toBe('auto')
    expect(bottomNav.style.visibility).toBe('')
    expect(bottomNav.style.pointerEvents).toBe('')
  })
})
