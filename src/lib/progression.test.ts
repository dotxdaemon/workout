import { describe, expect, it } from 'vitest'
import { buildProgressionSuggestion, isExerciseComplete } from './progression'
import type { ProgressionSettings } from '../types'

const settings: ProgressionSettings = {
  repMin: 6,
  repMax: 10,
  workSetsTarget: 3,
  weightIncrement: 5,
  unit: 'lb',
}

describe('buildProgressionSuggestion', () => {
  it('suggests increasing weight when all work sets hit repMax at same weight', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:02:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('increase_weight')
    expect(suggestion?.suggestedWeight).toBe(140)
    expect(suggestion?.nextReps).toEqual([6, 6, 6])
  })

  it('suggests adding reps to the lowest-rep work set when repMax is not reached', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 8, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
      { weight: 135, reps: 9, isWarmup: false, completedAt: '2026-02-16T00:02:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('add_reps')
    expect(suggestion?.suggestedWeight).toBe(135)
    expect(suggestion?.nextReps).toEqual([10, 9, 9])
  })

  it('returns collect_more_sets when completed work sets are below target', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('collect_more_sets')
  })
})

describe('isExerciseComplete', () => {
  it('requires all target work sets to be completed', () => {
    expect(
      isExerciseComplete(settings, [
        {
          weight: 135,
          reps: 10,
          isWarmup: false,
          completedAt: '2026-02-16T00:00:00.000Z',
        },
        {
          weight: 135,
          reps: 9,
          isWarmup: false,
          completedAt: '2026-02-16T00:01:00.000Z',
        },
        {
          weight: 135,
          reps: 8,
          isWarmup: false,
          completedAt: undefined,
        },
      ]),
    ).toBe(false)

    expect(
      isExerciseComplete(settings, [
        {
          weight: 135,
          reps: 10,
          isWarmup: false,
          completedAt: '2026-02-16T00:00:00.000Z',
        },
        {
          weight: 135,
          reps: 9,
          isWarmup: false,
          completedAt: '2026-02-16T00:01:00.000Z',
        },
        {
          weight: 135,
          reps: 8,
          isWarmup: false,
          completedAt: '2026-02-16T00:02:00.000Z',
        },
      ]),
    ).toBe(true)
  })
})
