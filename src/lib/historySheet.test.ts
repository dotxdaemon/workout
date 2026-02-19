// ABOUTME: Verifies swipe-down close decisions used by the history bottom sheet.
// ABOUTME: Ensures drag behavior is predictable for scrollable history content.
import { describe, expect, it } from 'vitest'
import {
  getHistorySheetDragOffset,
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
