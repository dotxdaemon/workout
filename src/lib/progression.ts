// ABOUTME: Computes workout progression suggestions from completed working sets.
// ABOUTME: Applies double progression by adding reps first, then increasing load.
import type { ProgressionSettings, SetEntry } from '../types'

export interface ProgressionSuggestion {
  kind: 'increase_weight' | 'add_reps' | 'collect_more_sets'
  message: string
  suggestedWeight: number
  nextReps: number[]
}

interface SetLike {
  weight: number
  reps: number
  isWarmup: boolean
  completedAt?: string
}

export function calculateEstimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function isExerciseComplete(
  settings: ProgressionSettings,
  sets: SetLike[],
): boolean {
  const workSets = sets.filter((set) => !set.isWarmup)
  if (workSets.length < settings.workSetsTarget) {
    return false
  }

  return workSets.slice(0, settings.workSetsTarget).every((set) => Boolean(set.completedAt))
}

export function buildProgressionSuggestion(
  settings: ProgressionSettings,
  sets: SetLike[],
): ProgressionSuggestion | null {
  const completedWorkSets = sets
    .filter((set) => !set.isWarmup && Boolean(set.completedAt))
    .slice(0, settings.workSetsTarget)

  if (completedWorkSets.length === 0) {
    return null
  }

  if (completedWorkSets.length < settings.workSetsTarget) {
    return {
      kind: 'collect_more_sets',
      message: `Complete ${settings.workSetsTarget} work sets to get a progression suggestion.`,
      suggestedWeight: completedWorkSets[0].weight,
      nextReps: completedWorkSets.map((set) => set.reps),
    }
  }

  const workingWeight = completedWorkSets[0].weight
  const allAtSameWeight = completedWorkSets.every((set) => set.weight === workingWeight)
  const allHitRepCap = completedWorkSets.every((set) => set.reps >= settings.repMax)

  // Double progression: add load only after all target work sets hit the rep ceiling.
  if (allAtSameWeight && allHitRepCap) {
    return {
      kind: 'increase_weight',
      message: `Increase to ${formatNumber(workingWeight + settings.weightIncrement)} ${settings.unit} next time and aim for ${settings.repMin} reps.`,
      suggestedWeight: workingWeight + settings.weightIncrement,
      nextReps: completedWorkSets.map(() => settings.repMin),
    }
  }

  const nextReps = completedWorkSets.map((set) => set.reps)
  const firstSetBelowMaxIndex = completedWorkSets.findIndex(
    (set) => set.reps < settings.repMax,
  )
  if (firstSetBelowMaxIndex >= 0) {
    nextReps[firstSetBelowMaxIndex] = Math.min(
      completedWorkSets[firstSetBelowMaxIndex].reps + 1,
      settings.repMax,
    )
  }

  return {
    kind: 'add_reps',
    message:
      firstSetBelowMaxIndex >= 0
        ? `Keep ${formatNumber(workingWeight)} ${settings.unit} and add +1 rep to set ${firstSetBelowMaxIndex + 1}.`
        : `Keep ${formatNumber(workingWeight)} ${settings.unit} and match last reps again.`,
    suggestedWeight: workingWeight,
    nextReps,
  }
}

export function extractWorkSets(entries: SetEntry[]): SetEntry[] {
  return entries.filter((entry) => !entry.isWarmup)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1)
}
