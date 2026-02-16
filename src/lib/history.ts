import { calculateEstimatedOneRepMax } from './progression'
import type { SetEntry } from '../types'

export interface SessionHistoryMetric {
  sessionId: string
  endedAt: string
  bestSet: SetEntry | null
  bestEstimatedOneRepMax: number
}

export interface ExerciseHistorySummary {
  sessions: SessionHistoryMetric[]
  bestRecentSet: SetEntry | null
  trendDeltaOneRepMax: number
}

interface SessionWithSets {
  session: {
    id: string
    endedAt?: string
  }
  sets: SetEntry[]
}

export function summarizeExerciseHistory(
  sessions: SessionWithSets[],
): ExerciseHistorySummary {
  const metrics = sessions
    .map((item) => {
      const workSets = item.sets.filter((set) => !set.isWarmup)
      const bestSet = pickBestSet(workSets)

      return {
        sessionId: item.session.id,
        endedAt: item.session.endedAt ?? '',
        bestSet,
        bestEstimatedOneRepMax: bestSet
          ? calculateEstimatedOneRepMax(bestSet.weight, bestSet.reps)
          : 0,
      }
    })
    .filter((metric) => metric.endedAt.length > 0)

  const bestRecentSet = pickBestSet(
    metrics
      .map((metric) => metric.bestSet)
      .filter((set): set is SetEntry => Boolean(set)),
  )

  const trendDeltaOneRepMax =
    metrics.length >= 2
      ? metrics[0].bestEstimatedOneRepMax -
        metrics[metrics.length - 1].bestEstimatedOneRepMax
      : 0

  return {
    sessions: metrics,
    bestRecentSet,
    trendDeltaOneRepMax,
  }
}

function pickBestSet(sets: SetEntry[]): SetEntry | null {
  let best: SetEntry | null = null
  let bestScore = 0

  for (const set of sets) {
    const score = calculateEstimatedOneRepMax(set.weight, set.reps)
    if (!best || score > bestScore) {
      best = set
      bestScore = score
    }
  }

  return best
}
