// ABOUTME: Declares split identifiers and routine ordering metadata used by routines screens.
// ABOUTME: Provides helpers to classify routines into 3 day or 4 day split groups.
import type { RoutineSplitId } from '../types'

export interface RoutineSplitOption {
  id: RoutineSplitId
  label: string
  routineOrder: string[]
  fallbackRoutineNames: string[]
}

export const fourDaySplitRoutineNames = [
  'Day 1 – Chest / Back / Biceps 1',
  'Day 2 – Shoulders / Legs / Triceps 1',
  'Day 3 – Chest / Back / Biceps 2',
  'Day 4 – Shoulders / Legs / Triceps 2',
]

export const routineSplitOptions: RoutineSplitOption[] = [
  {
    id: '3-day-split',
    label: '3 day split',
    routineOrder: ['pull', 'push', 'legs'],
    fallbackRoutineNames: ['Push', 'Pull', 'Legs'],
  },
  {
    id: '4-day-split',
    label: '4 day split',
    routineOrder: fourDaySplitRoutineNames.map((name) => name.toLowerCase()),
    fallbackRoutineNames: [...fourDaySplitRoutineNames],
  },
]

const fourDaySplitNameSet = new Set(fourDaySplitRoutineNames.map((name) => name.toLowerCase()))

export function inferRoutineSplitId(routineName: string): RoutineSplitId {
  return fourDaySplitNameSet.has(routineName.toLowerCase()) ? '4-day-split' : '3-day-split'
}
