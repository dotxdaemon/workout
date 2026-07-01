// ABOUTME: Tests the pure aggregation math behind today's masthead stats and history trends.
// ABOUTME: Verifies work-set counting, unit-grouped volume, completion, and e1RM deltas.
import { describe, expect, it } from 'vitest'
import { computeTodayStats, summarizeHistoryRows } from './sessionStats'

describe('computeTodayStats', () => {
  it('counts work sets, groups volume by unit, and tracks completion against targets', () => {
    const stats = computeTodayStats([
      {
        workSetsTarget: 3,
        unit: 'lb',
        sets: [
          { weight: 45, reps: 10, isWarmup: true },
          { weight: 135, reps: 8, isWarmup: false },
          { weight: 135, reps: 8, isWarmup: false },
          { weight: 135, reps: 7, isWarmup: false },
        ],
      },
      {
        workSetsTarget: 3,
        unit: 'kg',
        sets: [{ weight: 60, reps: 5, isWarmup: false }],
      },
      {
        workSetsTarget: 3,
        unit: 'lb',
        sets: [],
      },
    ])

    expect(stats.exerciseCount).toBe(3)
    expect(stats.totalWorkSets).toBe(4)
    expect(stats.completedCount).toBe(1)
    expect(stats.volumeByUnit).toEqual([
      { unit: 'lb', volume: 135 * 8 + 135 * 8 + 135 * 7 },
      { unit: 'kg', volume: 300 },
    ])
  })

  it('returns zeroed stats for no entries', () => {
    const stats = computeTodayStats([])

    expect(stats).toEqual({
      exerciseCount: 0,
      completedCount: 0,
      totalWorkSets: 0,
      volumeByUnit: [],
    })
  })
})

describe('summarizeHistoryRows', () => {
  const set = (weight: number, reps: number, isWarmup = false) => ({
    weight,
    reps,
    isWarmup,
  })

  it('finds the best set, per-row e1RM, and deltas versus the previous session', () => {
    // Newest first: 200x5, 195x5, 185x5.
    const overview = summarizeHistoryRows([
      { sets: [set(45, 10, true), set(200, 5)] },
      { sets: [set(195, 5)] },
      { sets: [set(185, 5)] },
    ])

    const expectedE1rm = (weight: number, reps: number) => weight * (1 + reps / 30)

    expect(overview.sessionCount).toBe(3)
    expect(overview.best).toEqual({
      weight: 200,
      reps: 5,
      estimatedOneRepMax: expectedE1rm(200, 5),
    })
    expect(overview.rows[0].estimatedOneRepMax).toBeCloseTo(expectedE1rm(200, 5))
    expect(overview.rows[0].deltaFromPrevious).toBeCloseTo(
      expectedE1rm(200, 5) - expectedE1rm(195, 5),
    )
    expect(overview.rows[2].deltaFromPrevious).toBeNull()
    // Oldest -> newest for a left-to-right trend.
    expect(overview.trendPoints).toEqual([
      expectedE1rm(185, 5),
      expectedE1rm(195, 5),
      expectedE1rm(200, 5),
    ])
  })

  it('skips warmup-only sessions when chaining deltas and trend points', () => {
    const overview = summarizeHistoryRows([
      { sets: [set(205, 5)] },
      { sets: [set(45, 12, true)] },
      { sets: [set(185, 5)] },
    ])

    expect(overview.rows[1].estimatedOneRepMax).toBeNull()
    expect(overview.rows[1].deltaFromPrevious).toBeNull()
    expect(overview.rows[0].deltaFromPrevious).toBeCloseTo(
      205 * (1 + 5 / 30) - 185 * (1 + 5 / 30),
    )
    expect(overview.trendPoints).toHaveLength(2)
  })

  it('returns an empty overview when there is no history', () => {
    const overview = summarizeHistoryRows([])

    expect(overview.best).toBeNull()
    expect(overview.trendPoints).toEqual([])
    expect(overview.rows).toEqual([])
  })
})
