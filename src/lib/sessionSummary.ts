// ABOUTME: Computes session totals (sets, volume, exercises done) for the Train stat strip.
// ABOUTME: Pure aggregation over set entries so the strip stays testable outside the UI.
import type { Exercise, SetEntry, Unit } from '../types'

export interface SessionSummary {
  totalSets: number
  volumeByUnit: Partial<Record<Unit, number>>
  doneCount: number
  exerciseCount: number
}

export function summarizeSession(
  exerciseIds: string[],
  exerciseMap: Record<string, Exercise>,
  setsByExercise: Record<string, SetEntry[]>,
): SessionSummary {
  let totalSets = 0
  let doneCount = 0
  let exerciseCount = 0
  const volumeByUnit: Partial<Record<Unit, number>> = {}

  for (const exerciseId of exerciseIds) {
    const exercise = exerciseMap[exerciseId]
    if (!exercise) {
      continue
    }
    exerciseCount += 1

    const workSets = (setsByExercise[exerciseId] ?? []).filter((set) => !set.isWarmup)
    totalSets += workSets.length

    const volume = workSets.reduce((sum, set) => sum + set.weight * set.reps, 0)
    if (volume > 0) {
      const unit = exercise.progressionSettings.unit
      volumeByUnit[unit] = (volumeByUnit[unit] ?? 0) + volume
    }

    const target = exercise.progressionSettings.workSetsTarget
    if (target > 0 && workSets.length >= target) {
      doneCount += 1
    }
  }

  return { totalSets, volumeByUnit, doneCount, exerciseCount }
}

export function formatVolume(volumeByUnit: Partial<Record<Unit, number>>): string {
  const parts = (Object.entries(volumeByUnit) as [Unit, number][])
    .filter(([, volume]) => volume > 0)
    .map(([unit, volume]) => `${Math.round(volume).toLocaleString('en-US')} ${unit}`)
  return parts.length > 0 ? parts.join(' + ') : '0'
}
