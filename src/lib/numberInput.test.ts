// ABOUTME: Unit tests for numeric parsing and quick-adjust delta math used by set entry.
// ABOUTME: Confirms clamping at zero, rep rounding, chip derivation, and delta formatting.
import { describe, expect, it } from 'vitest'
import { applyWeightDelta, parseNumber, parseReps, weightChipDeltas } from './numberInput'

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

describe('weightChipDeltas', () => {
  it('derives quick-adjust deltas from the exercise increment', () => {
    expect(weightChipDeltas(5)).toEqual([-5, 2.5, 5, 10])
    expect(weightChipDeltas(2.5)).toEqual([-2.5, 1.25, 2.5, 5])
  })

  it('returns no deltas for non-positive increments', () => {
    expect(weightChipDeltas(0)).toEqual([])
    expect(weightChipDeltas(-5)).toEqual([])
  })
})

describe('applyWeightDelta', () => {
  it('adds and subtracts deltas with weight formatting', () => {
    expect(applyWeightDelta('100', 5)).toBe('105')
    expect(applyWeightDelta('100', -5)).toBe('95')
    expect(applyWeightDelta('135', 2.5)).toBe('137.5')
  })

  it('starts from empty values and clamps to empty at zero', () => {
    expect(applyWeightDelta('', 5)).toBe('5')
    expect(applyWeightDelta('2.5', -5)).toBe('')
    expect(applyWeightDelta('', -5)).toBe('')
  })
})
