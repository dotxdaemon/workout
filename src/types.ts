export type Unit = 'lb' | 'kg'

export interface ProgressionSettings {
  repMin: number
  repMax: number
  workSetsTarget: number
  weightIncrement: number
  unit: Unit
}

export interface Exercise {
  id: string
  name: string
  equipment?: string
  unitDefault: Unit
  progressionSettings: ProgressionSettings
}

export interface Routine {
  id: string
  name: string
  exerciseIds: string[]
}

export interface SessionRecord {
  id: string
  startedAt: string
  endedAt?: string
  routineId?: string
  notes?: string
}

export interface SetEntry {
  id: string
  sessionId: string
  exerciseId: string
  index: number
  weight: number
  reps: number
  isWarmup: boolean
  completedAt?: string
}

export interface AppPreferences {
  defaultUnit: Unit
  restTimerEnabled: boolean
  restSeconds: number
}

export interface WorkoutExport {
  version: 1
  exportedAt: string
  preferences: AppPreferences
  data: {
    exercises: Exercise[]
    routines: Routine[]
    sessions: SessionRecord[]
    setEntries: SetEntry[]
  }
}
