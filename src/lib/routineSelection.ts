// ABOUTME: Persists active split and selected routine ids in localStorage.
// ABOUTME: Keeps split choices independent so switching splits restores the right routine.
import type { RoutineSplitId } from '../types'

const activeRoutineSplitIdKey = 'workout-tracker.active-routine-split-id.v1'
const selectedRoutineIdKeyPrefix = 'workout-tracker.selected-routine-id.v2'
const legacyThreeDaySelectedRoutineIdKey = 'workout-tracker.selected-routine-id.v1'

export function readActiveRoutineSplitId(): RoutineSplitId {
  const value = localStorage.getItem(activeRoutineSplitIdKey)
  if (value === '3-day-split' || value === '4-day-split') {
    return value
  }

  return '3-day-split'
}

export function writeActiveRoutineSplitId(splitId: RoutineSplitId): void {
  localStorage.setItem(activeRoutineSplitIdKey, splitId)
}

export function readSelectedRoutineId(splitId: RoutineSplitId): string {
  const value = localStorage.getItem(getSplitRoutineSelectionKey(splitId))
  if (value) {
    return value
  }

  if (splitId === '3-day-split') {
    return localStorage.getItem(legacyThreeDaySelectedRoutineIdKey) ?? ''
  }

  return ''
}

export function writeSelectedRoutineId(splitId: RoutineSplitId, routineId: string): void {
  const key = getSplitRoutineSelectionKey(splitId)

  if (!routineId) {
    localStorage.removeItem(key)

    if (splitId === '3-day-split') {
      localStorage.removeItem(legacyThreeDaySelectedRoutineIdKey)
    }
    return
  }

  localStorage.setItem(key, routineId)
  if (splitId === '3-day-split') {
    localStorage.setItem(legacyThreeDaySelectedRoutineIdKey, routineId)
  }
}

function getSplitRoutineSelectionKey(splitId: RoutineSplitId): string {
  return `${selectedRoutineIdKeyPrefix}.${splitId}`
}
