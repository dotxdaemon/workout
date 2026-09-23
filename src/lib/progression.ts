// ABOUTME: Computes workout progression suggestions from completed working sets.
// ABOUTME: Applies double progression by adding reps first, then increasing load.
import type { ProgressionSettings, SetEntry, Unit } from '../types'
import { convertWeight, formatWeight } from './units'

export interface ProgressionSuggestion {
  kind: 'increase_weight' | 'add_reps' | 'collect_more_sets' | 'review_sets'
  message: string
  suggestedWeight: number | null
  nextReps: number[]
}

interface SetLike {
  weight: number
  reps: number
  isWarmup: boolean
  completedAt?: string
  unit?: Unit
}

export function isCompletedWorkSet(set: SetLike): boolean {
  return (
    !set.isWarmup &&
    Boolean(set.completedAt) &&
    Number.isFinite(set.weight) &&
    set.weight >= 0 &&
    Number.isInteger(set.reps) &&
    set.reps > 0
  )
}

export function calculateEstimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function isExerciseComplete(
  settings: ProgressionSettings,
  sets: SetLike[],
): boolean {
  return (
    settings.workSetsTarget > 0 &&
    sets.filter(isCompletedWorkSet).length >= settings.workSetsTarget
  )
}

export function buildProgressionSuggestion(
  settings: ProgressionSettings,
  sets: SetLike[],
): ProgressionSuggestion | null {
  const completedWorkSets = sets
    .filter(isCompletedWorkSet)
    .slice(0, settings.workSetsTarget)
    .map((set) => ({
      ...set,
      weight: convertWeight(set.weight, set.unit ?? settings.unit, settings.unit),
    }))

  if (completedWorkSets.length === 0) {
    return null
  }

  if (completedWorkSets.length < settings.workSetsTarget) {
    return {
      kind: 'collect_more_sets',
      message: `Only ${completedWorkSets.length} of ${settings.workSetsTarget} working sets were completed. There is not enough recorded work to choose a next-session target.`,
      suggestedWeight: null,
      nextReps: completedWorkSets.map((set) => set.reps),
    }
  }

  const workingWeight = completedWorkSets[0].weight
  const allAtSameWeight = completedWorkSets.every(
    (set) => Math.abs(set.weight - workingWeight) < 0.005,
  )
  const allHitRepCap = completedWorkSets.every((set) => set.reps >= settings.repMax)

  if (!allAtSameWeight) {
    return {
      kind: 'review_sets',
      message:
        'Working sets used different loads. Review those sets before choosing a next-session target.',
      suggestedWeight: null,
      nextReps: completedWorkSets.map((set) => set.reps),
    }
  }

  // Double progression: add load only after all target work sets hit the rep ceiling.
  if (allHitRepCap) {
    const suggestedWeight = Number((workingWeight + settings.weightIncrement).toFixed(2))
    return {
      kind: 'increase_weight',
      message: `All ${settings.workSetsTarget} working sets reached ${settings.repMax} reps. Next time: ${formatWeight(suggestedWeight)} ${settings.unit} for ${settings.repMin} reps per set.`,
      suggestedWeight,
      nextReps: completedWorkSets.map(() => settings.repMin),
    }
  }

  const nextReps = completedWorkSets.map((set) => set.reps)
  const lowestReps = Math.min(...nextReps)
  const lowestSetIndex = nextReps.indexOf(lowestReps)
  nextReps[lowestSetIndex] = Math.min(lowestReps + 1, settings.repMax)

  return {
    kind: 'add_reps',
    message: `Set ${lowestSetIndex + 1} had the fewest reps (${lowestReps}). Keep ${formatWeight(workingWeight)} ${settings.unit} and aim for ${nextReps[lowestSetIndex]} reps on that set.`,
    suggestedWeight: workingWeight,
    nextReps,
  }
}

export function extractWorkSets(entries: SetEntry[]): SetEntry[] {
  return entries.filter((entry) => !entry.isWarmup)
}
