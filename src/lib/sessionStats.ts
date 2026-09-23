// ABOUTME: Pure aggregation helpers for today's session stats and exercise history trends.
// ABOUTME: Keeps masthead readouts and history-sheet math out of React components for direct testing.
import { calculateEstimatedOneRepMax, isCompletedWorkSet } from './progression'
import { convertWeight } from './units'
import type { Unit } from '../types'

interface StatSet {
  weight: number
  reps: number
  isWarmup: boolean
  completedAt?: string
  unit?: Unit
}

export interface TodayExerciseStatsInput {
  workSetsTarget: number
  unit: Unit
  sets: StatSet[]
}

export interface TodayStats {
  exerciseCount: number
  completedCount: number
  totalWorkSets: number
  volumeByUnit: Array<{ unit: Unit; volume: number }>
}

export function computeTodayStats(entries: TodayExerciseStatsInput[]): TodayStats {
  let totalWorkSets = 0
  let completedCount = 0
  const volumeByUnit = new Map<Unit, number>()

  for (const entry of entries) {
    const workSets = entry.sets.filter(isCompletedWorkSet)
    totalWorkSets += workSets.length

    if (entry.workSetsTarget > 0 && workSets.length >= entry.workSetsTarget) {
      completedCount += 1
    }

    for (const set of workSets) {
      const unit = set.unit ?? entry.unit
      volumeByUnit.set(unit, (volumeByUnit.get(unit) ?? 0) + set.weight * set.reps)
    }
  }

  return {
    exerciseCount: entries.length,
    completedCount,
    totalWorkSets,
    volumeByUnit: Array.from(volumeByUnit.entries())
      .filter(([, volume]) => volume > 0)
      .map(([unit, volume]) => ({ unit, volume })),
  }
}

export interface HistoryRowInput {
  sets: StatSet[]
  endedAt?: string
}

export interface HistoryRowMetric {
  estimatedOneRepMax: number | null
  deltaFromPrevious: number | null
}

export interface HistoryOverview {
  sessionCount: number
  best: { weight: number; reps: number; estimatedOneRepMax: number } | null
  trendPoints: number[]
  rows: HistoryRowMetric[]
}

// Rows arrive newest-first (the history sheet order); trendPoints come back oldest-first
// so a sparkline reads left-to-right through time.
export function summarizeHistoryRows(
  rowsNewestFirst: HistoryRowInput[],
  unit: Unit,
): HistoryOverview {
  const tops = rowsNewestFirst.map((row) => {
    if (!row.endedAt) {
      return null
    }
    let best: StatSet | null = null
    let bestScore = 0

    for (const set of row.sets) {
      if (!isCompletedWorkSet(set)) {
        continue
      }
      const weight = convertWeight(set.weight, set.unit ?? unit, unit)
      const score = calculateEstimatedOneRepMax(weight, set.reps)
      if (!best || score > bestScore) {
        best = { ...set, weight, unit }
        bestScore = score
      }
    }

    return best ? { set: best, estimatedOneRepMax: bestScore } : null
  })

  let best: HistoryOverview['best'] = null
  for (const top of tops) {
    if (top && (!best || top.estimatedOneRepMax > best.estimatedOneRepMax)) {
      best = {
        weight: top.set.weight,
        reps: top.set.reps,
        estimatedOneRepMax: top.estimatedOneRepMax,
      }
    }
  }

  const rows: HistoryRowMetric[] = tops.map((top, index) => {
    if (!top) {
      return { estimatedOneRepMax: null, deltaFromPrevious: null }
    }

    let previous: number | null = null
    for (let older = index + 1; older < tops.length; older += 1) {
      const olderTop = tops[older]
      if (olderTop) {
        previous = olderTop.estimatedOneRepMax
        break
      }
    }

    return {
      estimatedOneRepMax: top.estimatedOneRepMax,
      deltaFromPrevious: previous == null ? null : top.estimatedOneRepMax - previous,
    }
  })

  const trendPoints = tops
    .filter((top): top is NonNullable<(typeof tops)[number]> => Boolean(top))
    .map((top) => top.estimatedOneRepMax)
    .reverse()

  return {
    sessionCount: tops.filter(Boolean).length,
    best,
    trendPoints,
    rows,
  }
}
