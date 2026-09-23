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
          {
            weight: 45,
            reps: 10,
            isWarmup: true,
            completedAt: '2026-02-16T00:00:00.000Z',
          },
          {
            weight: 135,
            reps: 8,
            isWarmup: false,
            completedAt: '2026-02-16T00:01:00.000Z',
          },
          {
            weight: 135,
            reps: 8,
            isWarmup: false,
            completedAt: '2026-02-16T00:02:00.000Z',
          },
          {
            weight: 135,
            reps: 7,
            isWarmup: false,
            completedAt: '2026-02-16T00:03:00.000Z',
          },
        ],
      },
      {
        workSetsTarget: 3,
        unit: 'kg',
        sets: [
          {
            weight: 60,
            reps: 5,
            isWarmup: false,
            completedAt: '2026-02-16T00:00:00.000Z',
          },
        ],
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

  it('excludes unfinished and invalid sets and groups volume by recorded units', () => {
    const stats = computeTodayStats([
      {
        workSetsTarget: 3,
        unit: 'lb',
        sets: [
          { weight: 100, reps: 10, isWarmup: false },
          {
            weight: 100,
            reps: 0,
            isWarmup: false,
            completedAt: '2026-02-16T00:00:00.000Z',
          },
          {
            weight: 50,
            reps: 10,
            unit: 'kg',
            isWarmup: false,
            completedAt: '2026-02-16T00:01:00.000Z',
          },
          {
            weight: 100,
            reps: 10,
            unit: 'lb',
            isWarmup: false,
            completedAt: '2026-02-16T00:02:00.000Z',
          },
        ],
      },
    ])

    expect(stats.totalWorkSets).toBe(2)
    expect(stats.completedCount).toBe(0)
    expect(stats.volumeByUnit).toEqual([
      { unit: 'kg', volume: 500 },
      { unit: 'lb', volume: 1000 },
    ])
  })
})

describe('summarizeHistoryRows', () => {
  const set = (weight: number, reps: number, isWarmup = false) => ({
    weight,
    reps,
    isWarmup,
    completedAt: '2026-02-16T00:00:00.000Z',
  })
  const endedAt = '2026-02-16T01:00:00.000Z'

  it('finds the best set, per-row e1RM, and deltas versus the previous session', () => {
    // Newest first: 200x5, 195x5, 185x5.
    const overview = summarizeHistoryRows(
      [
        { endedAt, sets: [set(45, 10, true), set(200, 5)] },
        { endedAt, sets: [set(195, 5)] },
        { endedAt, sets: [set(185, 5)] },
      ],
      'lb',
    )

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
    const overview = summarizeHistoryRows(
      [
        { endedAt, sets: [set(205, 5)] },
        { endedAt, sets: [set(45, 12, true)] },
        { endedAt, sets: [set(185, 5)] },
      ],
      'lb',
    )

    expect(overview.rows[1].estimatedOneRepMax).toBeNull()
    expect(overview.rows[1].deltaFromPrevious).toBeNull()
    expect(overview.rows[0].deltaFromPrevious).toBeCloseTo(
      205 * (1 + 5 / 30) - 185 * (1 + 5 / 30),
    )
    expect(overview.trendPoints).toHaveLength(2)
  })

  it('returns an empty overview when there is no history', () => {
    const overview = summarizeHistoryRows([], 'lb')

    expect(overview.best).toBeNull()
    expect(overview.trendPoints).toEqual([])
    expect(overview.rows).toEqual([])
  })

  it('does not compare unfinished sessions or prefilled sets as performance', () => {
    const overview = summarizeHistoryRows(
      [
        { sets: [set(300, 10)] },
        { endedAt, sets: [{ ...set(250, 10), completedAt: undefined }] },
        { endedAt, sets: [set(185, 5)] },
      ],
      'lb',
    )

    expect(overview.sessionCount).toBe(1)
    expect(overview.best?.weight).toBe(185)
    expect(overview.rows[0]).toEqual({
      estimatedOneRepMax: null,
      deltaFromPrevious: null,
    })
    expect(overview.rows[1]).toEqual({
      estimatedOneRepMax: null,
      deltaFromPrevious: null,
    })
    expect(overview.trendPoints).toHaveLength(1)
  })

  it('compares equivalent loads in a common unit', () => {
    const overview = summarizeHistoryRows(
      [
        { endedAt, sets: [{ ...set(45.359237, 10), unit: 'kg' }] },
        { endedAt, sets: [{ ...set(100, 10), unit: 'lb' }] },
      ],
      'lb',
    )

    expect(overview.rows[0].deltaFromPrevious).toBeCloseTo(0, 8)
    expect(overview.best?.weight).toBeCloseTo(100, 8)
    expect(overview.rows[0].estimatedOneRepMax).toBeCloseTo(100 * (1 + 10 / 30), 8)
  })
})
