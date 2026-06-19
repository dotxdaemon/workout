// ABOUTME: Unit tests for numeric parsing and stepping used by the set-entry number field.
// ABOUTME: Confirms clamping at zero, rep rounding, and increment/decrement formatting.
import { describe, expect, it } from 'vitest'
import { parseNumber, parseReps, stepValue } from './numberInput'

describe('parseNumber', () => {
  it('parses finite non-negative numbers and clamps the rest to zero', () => {
    expect(parseNumber('100')).toBe(100)
    expect(parseNumber('2.5')).toBe(2.5)
    expect(parseNumber('-3')).toBe(0)
    expect(parseNumber('not a number')).toBe(0)
    expect(parseNumber('')).toBe(0)
  })
})

describe('parseReps', () => {
  it('rounds to whole reps and never goes negative', () => {
    expect(parseReps('8')).toBe(8)
    expect(parseReps('8.6')).toBe(9)
    expect(parseReps('-2')).toBe(0)
  })
})

describe('stepValue', () => {
  it('increments and decrements weight values', () => {
    expect(stepValue('100', { step: 5, direction: 1 })).toBe('105')
    expect(stepValue('100', { step: 5, direction: -1 })).toBe('95')
    expect(stepValue('2.5', { step: 2.5, direction: 1 })).toBe('5')
  })

  it('steps from empty values and clamps to empty at zero', () => {
    expect(stepValue('', { step: 5, direction: 1 })).toBe('5')
    expect(stepValue('5', { step: 5, direction: -1 })).toBe('')
    expect(stepValue('', { step: 5, direction: -1 })).toBe('')
  })

  it('keeps reps as whole numbers', () => {
    expect(stepValue('8', { step: 1, direction: 1, integer: true })).toBe('9')
    expect(stepValue('1', { step: 1, direction: -1, integer: true })).toBe('')
  })
})
