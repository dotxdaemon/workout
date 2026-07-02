// ABOUTME: Unit tests for the session summary aggregation behind the Train stat strip.
// ABOUTME: Confirms set counting, per-unit volume, done thresholds, and volume formatting.
import { describe, expect, it } from 'vitest'
import { formatVolume, summarizeSession } from './sessionSummary'
import type { Exercise, SetEntry } from '../types'

function makeExercise(id: string, overrides?: {
  unit?: 'lb' | 'kg'
  workSetsTarget?: number
}): Exercise {
  return {
    id,
    name: id,
    unitDefault: overrides?.unit ?? 'lb',
    progressionSettings: {
      repMin: 5,
      repMax: 8,
      workSetsTarget: overrides?.workSetsTarget ?? 3,
      weightIncrement: 5,
      unit: overrides?.unit ?? 'lb',
    },
  }
}

function makeSet(exerciseId: string, weight: number, reps: number, isWarmup = false): SetEntry {
  return {
    id: `${exerciseId}-${weight}-${reps}-${isWarmup}`,
    sessionId: 'session',
    exerciseId,
    index: 0,
    weight,
    reps,
    isWarmup,
  }
}

describe('summarizeSession', () => {
  it('counts work sets and volume while excluding warmups', () => {
    const summary = summarizeSession(
      ['bench'],
      { bench: makeExercise('bench') },
      {
        bench: [
          makeSet('bench', 45, 10, true),
          makeSet('bench', 100, 8),
          makeSet('bench', 100, 6),
        ],
      },
    )

    expect(summary.totalSets).toBe(2)
    expect(summary.volumeByUnit).toEqual({ lb: 1400 })
    expect(summary.exerciseCount).toBe(1)
  })

  it('marks an exercise done once its work-set target is met', () => {
    const exerciseMap = {
      bench: makeExercise('bench', { workSetsTarget: 2 }),
      row: makeExercise('row', { workSetsTarget: 3 }),
    }
    const summary = summarizeSession(['bench', 'row'], exerciseMap, {
      bench: [makeSet('bench', 100, 8), makeSet('bench', 100, 8)],
      row: [makeSet('row', 80, 10)],
    })

    expect(summary.doneCount).toBe(1)
    expect(summary.exerciseCount).toBe(2)
  })

  it('keeps volume separated by unit and skips unknown exercises', () => {
    const exerciseMap = {
      bench: makeExercise('bench', { unit: 'lb' }),
      squat: makeExercise('squat', { unit: 'kg' }),
    }
    const summary = summarizeSession(['bench', 'squat', 'ghost'], exerciseMap, {
      bench: [makeSet('bench', 100, 10)],
      squat: [makeSet('squat', 60, 5)],
      ghost: [makeSet('ghost', 50, 5)],
    })

    expect(summary.volumeByUnit).toEqual({ lb: 1000, kg: 300 })
    expect(summary.totalSets).toBe(2)
    expect(summary.exerciseCount).toBe(2)
  })

  it('summarizes an empty session as zeroes', () => {
    const summary = summarizeSession(['bench'], { bench: makeExercise('bench') }, {})

    expect(summary.totalSets).toBe(0)
    expect(summary.volumeByUnit).toEqual({})
    expect(summary.doneCount).toBe(0)
  })
})

describe('formatVolume', () => {
  it('formats grouped totals with their unit', () => {
    expect(formatVolume({ lb: 4830 })).toBe('4,830 lb')
    expect(formatVolume({ lb: 1400, kg: 300 })).toBe('1,400 lb + 300 kg')
  })

  it('formats an empty session as a bare zero', () => {
    expect(formatVolume({})).toBe('0')
  })
})
