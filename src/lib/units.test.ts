// ABOUTME: Tests unit conversion and readable weight formatting.
// ABOUTME: Ensures calculations preserve precision while displayed values avoid rounding artifacts.
import { describe, expect, it } from 'vitest'
import { convertWeight, formatWeight } from './units'

describe('convertWeight', () => {
  it('converts pounds and kilograms without rounding stored values', () => {
    expect(convertWeight(100, 'lb', 'kg')).toBeCloseTo(45.359237, 8)
    expect(convertWeight(45.359237, 'kg', 'lb')).toBeCloseTo(100, 8)
    expect(convertWeight(0, 'kg', 'lb')).toBe(0)
    expect(convertWeight(1.234567, 'lb', 'lb')).toBe(1.234567)
  })
})

describe('formatWeight', () => {
  it('shows up to two decimal places without trailing zeroes or floating-point artifacts', () => {
    expect(formatWeight(0.1 + 0.2)).toBe('0.3')
    expect(formatWeight(1.25)).toBe('1.25')
    expect(formatWeight(45.359237)).toBe('45.36')
    expect(formatWeight(100)).toBe('100')
    expect(formatWeight(0)).toBe('0')
  })
})
