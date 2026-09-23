// ABOUTME: Tests double-progression logic and completion checks for exercise work sets.
// ABOUTME: Verifies weight/rep suggestions are deterministic from stored set entries.
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

  it('suggests adding one rep to the lowest-rep working set', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 9, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 8, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
      { weight: 135, reps: 9, isWarmup: false, completedAt: '2026-02-16T00:02:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('add_reps')
    expect(suggestion?.suggestedWeight).toBe(135)
    expect(suggestion?.nextReps).toEqual([9, 9, 9])
    expect(suggestion?.message).toContain('Set 2 had the fewest reps (8)')
  })

  it('targets the lowest last set and uses the first tied set without increasing load', () => {
    const sets = [8, 8, 7].map((reps) => ({
      weight: 135,
      reps,
      isWarmup: false,
      completedAt: '2026-02-16T00:00:00.000Z',
    }))
    const suggestion = buildProgressionSuggestion(settings, sets)
    expect(suggestion?.kind).toBe('add_reps')
    expect(suggestion?.suggestedWeight).toBe(135)
    expect(suggestion?.nextReps).toEqual([8, 8, 8])
    expect(suggestion?.message).toContain('Set 3 had the fewest reps (7)')
    sets[0].reps = 7
    expect(buildProgressionSuggestion(settings, sets)?.nextReps).toEqual([8, 8, 7])
  })

  it('returns collect_more_sets when completed work sets are below target', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('collect_more_sets')
  })

  it('does not suggest one load for working sets performed at different loads', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 125, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
      { weight: 125, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:02:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('review_sets')
    expect(suggestion?.suggestedWeight).toBeNull()
    expect(suggestion?.message).toContain('different loads')
  })

  it('ignores warmups, unfinished sets, and invalid completed values', () => {
    const suggestion = buildProgressionSuggestion(settings, [
      { weight: 135, reps: 10, isWarmup: true, completedAt: '2026-02-16T00:00:00.000Z' },
      { weight: 135, reps: 10, isWarmup: false },
      { weight: 135, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:01:00.000Z' },
      { weight: 135, reps: 0, isWarmup: false, completedAt: '2026-02-16T00:02:00.000Z' },
      { weight: NaN, reps: 10, isWarmup: false, completedAt: '2026-02-16T00:03:00.000Z' },
    ])

    expect(suggestion?.kind).toBe('collect_more_sets')
    expect(suggestion?.nextReps).toEqual([10])
  })

  it('keeps the load when one of the target sets misses the rep ceiling', () => {
    const suggestion = buildProgressionSuggestion(
      { ...settings, repMin: 8, repMax: 12 },
      [
        {
          weight: 135,
          reps: 12,
          isWarmup: false,
          completedAt: '2026-02-16T00:00:00.000Z',
        },
        {
          weight: 135,
          reps: 12,
          isWarmup: false,
          completedAt: '2026-02-16T00:01:00.000Z',
        },
        {
          weight: 135,
          reps: 9,
          isWarmup: false,
          completedAt: '2026-02-16T00:02:00.000Z',
        },
      ],
    )

    expect(suggestion?.kind).toBe('add_reps')
    expect(suggestion?.suggestedWeight).toBe(135)
    expect(suggestion?.nextReps).toEqual([12, 12, 10])
  })

  it('compares loads in the configured unit before suggesting an increase', () => {
    const sets = [
      {
        weight: 100,
        unit: 'lb' as const,
        reps: 10,
        isWarmup: false,
        completedAt: '2026-02-16T00:00:00.000Z',
      },
      {
        weight: 100,
        unit: 'kg' as const,
        reps: 10,
        isWarmup: false,
        completedAt: '2026-02-16T00:01:00.000Z',
      },
      {
        weight: 100,
        unit: 'lb' as const,
        reps: 10,
        isWarmup: false,
        completedAt: '2026-02-16T00:02:00.000Z',
      },
    ]

    expect(buildProgressionSuggestion(settings, sets)?.kind).toBe('review_sets')

    sets[1].weight = 45.359237
    const suggestion = buildProgressionSuggestion(settings, sets)
    expect(suggestion?.kind).toBe('increase_weight')
    expect(suggestion?.suggestedWeight).toBe(105)
    expect(suggestion?.message).toContain('All 3 working sets reached 10 reps')
  })

  it('supports zero external load and rounds a target only after adding the increment', () => {
    const zeroSets = Array.from({ length: 3 }, () => ({
      weight: 0,
      reps: 10,
      isWarmup: false,
      completedAt: '2026-02-16T00:00:00.000Z',
    }))
    expect(buildProgressionSuggestion(settings, zeroSets)?.suggestedWeight).toBe(5)

    const decimalSets = zeroSets.map((set) => ({ ...set, weight: 0.2 }))
    expect(
      buildProgressionSuggestion({ ...settings, weightIncrement: 0.1 }, decimalSets)
        ?.suggestedWeight,
    ).toBe(0.3)
  })
})

describe('isExerciseComplete', () => {
  it('requires completed sets with valid weights and reps', () => {
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
          reps: 0,
          isWarmup: false,
          completedAt: '2026-02-16T00:01:00.000Z',
        },
        {
          weight: -1,
          reps: 10,
          isWarmup: false,
          completedAt: '2026-02-16T00:02:00.000Z',
        },
      ]),
    ).toBe(false)
  })

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
