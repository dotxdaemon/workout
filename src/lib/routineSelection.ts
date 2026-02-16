const selectedRoutineIdKey = 'workout-tracker.selected-routine-id.v1'

export function readSelectedRoutineId(): string {
  const value = localStorage.getItem(selectedRoutineIdKey)
  if (!value) {
    return ''
  }

  return value
}

export function writeSelectedRoutineId(routineId: string): void {
  if (!routineId) {
    localStorage.removeItem(selectedRoutineIdKey)
    return
  }

  localStorage.setItem(selectedRoutineIdKey, routineId)
}
