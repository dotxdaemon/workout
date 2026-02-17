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
