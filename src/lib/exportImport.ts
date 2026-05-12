// ABOUTME: Builds and validates backup payloads for workout data export and import.
// ABOUTME: Ensures imported data is structurally valid before replacing local storage.
import {
  importFullExportData,
  markCoreRoutinesRestored,
  readFullExportData,
} from './db'
import { defaultPreferences, writePreferences } from './preferences'
import type {
  AppPreferences,
  Exercise,
  ProgressionSettings,
  Routine,
  SessionRecord,
  SetEntry,
  WorkoutExport,
} from '../types'

export async function buildJsonExport(preferences: AppPreferences): Promise<string> {
  const data = await readFullExportData()
  const payload: WorkoutExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    preferences,
    data,
  }

  return JSON.stringify(payload, null, 2)
}

export async function buildCsvExport(): Promise<string> {
  const { sessions, setEntries } = await readFullExportData()
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))

  const header = [
    'session_id',
    'started_at',
    'ended_at',
    'routine_id',
    'exercise_id',
    'set_index',
    'weight',
    'reps',
    'is_warmup',
    'completed_at',
  ]

  const rows = setEntries
    .slice()
    .sort((a, b) => {
      if (a.sessionId === b.sessionId) {
        if (a.exerciseId === b.exerciseId) {
          return a.index - b.index
        }
        return a.exerciseId.localeCompare(b.exerciseId)
      }
      return a.sessionId.localeCompare(b.sessionId)
    })
    .map((entry) => {
      const session = sessionMap.get(entry.sessionId)
      return [
        entry.sessionId,
        session?.startedAt ?? '',
        session?.endedAt ?? '',
        session?.routineId ?? '',
        entry.exerciseId,
        entry.index,
        entry.weight,
        entry.reps,
        entry.isWarmup ? 'true' : 'false',
        entry.completedAt ?? '',
      ]
    })

  return [header, ...rows].map(toCsvRow).join('\n')
}

export async function applyJsonImport(jsonText: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Import failed: file is not valid JSON.')
  }

  const payload = validatePayload(parsed)

  await importFullExportData(payload.data)
  markCoreRoutinesRestored()
  writePreferences(payload.preferences)
}

export async function triggerDownload(
  fileName: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()

  URL.revokeObjectURL(url)
}

function validatePayload(value: unknown): WorkoutExport {
  if (!value || typeof value !== 'object') {
    throw new Error('Import failed: expected an object at the top level.')
  }

  const payload = value as Partial<WorkoutExport>

  if (payload.version !== 1) {
    throw new Error('Import failed: unsupported export version.')
  }

  const data = payload.data
  if (!data || typeof data !== 'object') {
    throw new Error('Import failed: missing data section.')
  }

  assertArray(data.exercises, 'data.exercises')
  assertArray(data.routines, 'data.routines')
  assertArray(data.sessions, 'data.sessions')
  assertArray(data.setEntries, 'data.setEntries')

  data.exercises.forEach((exercise, index) => validateExercise(exercise, index))
  data.routines.forEach((routine, index) => validateRoutine(routine, index))
  data.sessions.forEach((session, index) => validateSession(session, index))
  data.setEntries.forEach((entry, index) => validateSetEntry(entry, index))

  const exercises = data.exercises as Exercise[]
  const routines = data.routines as Routine[]
  const sessions = data.sessions as SessionRecord[]
  const setEntries = data.setEntries as SetEntry[]

  validateReferences({
    exercises,
    routines,
    sessions,
    setEntries,
  })

  const preferences = validatePreferences(payload.preferences)

  return {
    version: 1,
    exportedAt:
      typeof payload.exportedAt === 'string'
        ? payload.exportedAt
        : new Date().toISOString(),
    preferences,
    data: {
      exercises,
      routines,
      sessions,
      setEntries,
    },
  }
}

function validatePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') {
    return defaultPreferences
  }

  const preferences = value as Partial<AppPreferences>

  const defaultUnit =
    preferences.defaultUnit === 'kg' || preferences.defaultUnit === 'lb'
      ? preferences.defaultUnit
      : defaultPreferences.defaultUnit
  const defaultWeightIncrement =
    typeof preferences.defaultWeightIncrement === 'number' &&
    Number.isFinite(preferences.defaultWeightIncrement)
      ? Math.max(0.1, preferences.defaultWeightIncrement)
      : defaultPreferences.defaultWeightIncrement
  const restTimerEnabled =
    typeof preferences.restTimerEnabled === 'boolean'
      ? preferences.restTimerEnabled
      : defaultPreferences.restTimerEnabled
  const restSeconds =
    typeof preferences.restSeconds === 'number' && Number.isFinite(preferences.restSeconds)
      ? Math.max(0, Math.round(preferences.restSeconds))
      : defaultPreferences.restSeconds
  const theme =
    preferences.theme === 'light' || preferences.theme === 'dark'
      ? preferences.theme
      : defaultPreferences.theme

  return {
    defaultUnit,
    defaultWeightIncrement,
    restTimerEnabled,
    restSeconds,
    theme,
  }
}

function validateExercise(value: unknown, index: number): void {
  const label = `data.exercises[${index}]`
  assertObject(value, label)

  const exercise = value as Partial<Exercise>
  if (typeof exercise.id !== 'string' || exercise.id.length === 0) {
    throw new Error(`Import failed: ${label}.id must be a non-empty string.`)
  }
  if (typeof exercise.name !== 'string' || exercise.name.trim().length === 0) {
    throw new Error(`Import failed: ${label}.name must be a non-empty string.`)
  }
  if (exercise.unitDefault !== 'lb' && exercise.unitDefault !== 'kg') {
    throw new Error(`Import failed: ${label}.unitDefault must be lb or kg.`)
  }
  validateProgressionSettings(exercise.progressionSettings, `${label}.progressionSettings`)
}

function validateProgressionSettings(value: unknown, label: string): void {
  assertObject(value, label)

  const settings = value as Partial<ProgressionSettings>
  if (settings.unit !== 'lb' && settings.unit !== 'kg') {
    throw new Error(`Import failed: ${label}.unit must be lb or kg.`)
  }
  if (typeof settings.repMin !== 'number' || !Number.isInteger(settings.repMin) || settings.repMin < 1) {
    throw new Error(`Import failed: ${label}.repMin must be a positive integer.`)
  }
  if (typeof settings.repMax !== 'number' || !Number.isInteger(settings.repMax) || settings.repMax < 1) {
    throw new Error(`Import failed: ${label}.repMax must be a positive integer.`)
  }
  if (settings.repMax < settings.repMin) {
    throw new Error(`Import failed: ${label}.repMax must be greater than or equal to repMin.`)
  }
  if (
    typeof settings.workSetsTarget !== 'number' ||
    !Number.isInteger(settings.workSetsTarget) ||
    settings.workSetsTarget < 1
  ) {
    throw new Error(`Import failed: ${label}.workSetsTarget must be a positive integer.`)
  }
  if (
    typeof settings.weightIncrement !== 'number' ||
    !Number.isFinite(settings.weightIncrement) ||
    settings.weightIncrement <= 0
  ) {
    throw new Error(`Import failed: ${label}.weightIncrement must be a positive number.`)
  }
}

function validateRoutine(value: unknown, index: number): void {
  const label = `data.routines[${index}]`
  assertObject(value, label)

  const routine = value as Partial<Routine>
  if (typeof routine.id !== 'string' || routine.id.length === 0) {
    throw new Error(`Import failed: ${label}.id must be a non-empty string.`)
  }
  if (typeof routine.name !== 'string' || routine.name.trim().length === 0) {
    throw new Error(`Import failed: ${label}.name must be a non-empty string.`)
  }
  if (
    typeof routine.splitId !== 'undefined' &&
    routine.splitId !== '3-day-split' &&
    routine.splitId !== '4-day-split'
  ) {
    throw new Error(`Import failed: ${label}.splitId must be 3-day-split or 4-day-split.`)
  }
  assertArray(routine.exerciseIds, `${label}.exerciseIds`)
  routine.exerciseIds.forEach((exerciseId, exerciseIndex) => {
    if (typeof exerciseId !== 'string') {
      throw new Error(
        `Import failed: ${label}.exerciseIds[${exerciseIndex}] must be a string.`,
      )
    }
  })
}

function validateSession(value: unknown, index: number): void {
  const label = `data.sessions[${index}]`
  assertObject(value, label)

  const session = value as Partial<SessionRecord>
  if (typeof session.id !== 'string' || session.id.length === 0) {
    throw new Error(`Import failed: ${label}.id must be a non-empty string.`)
  }
  if (typeof session.startedAt !== 'string' || session.startedAt.length === 0) {
    throw new Error(`Import failed: ${label}.startedAt must be an ISO string.`)
  }
}

function validateSetEntry(value: unknown, index: number): void {
  const label = `data.setEntries[${index}]`
  assertObject(value, label)

  const entry = value as Partial<SetEntry>
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    throw new Error(`Import failed: ${label}.id must be a non-empty string.`)
  }
  if (typeof entry.sessionId !== 'string' || entry.sessionId.length === 0) {
    throw new Error(`Import failed: ${label}.sessionId must be a non-empty string.`)
  }
  if (typeof entry.exerciseId !== 'string' || entry.exerciseId.length === 0) {
    throw new Error(`Import failed: ${label}.exerciseId must be a non-empty string.`)
  }
  if (typeof entry.index !== 'number' || !Number.isInteger(entry.index)) {
    throw new Error(`Import failed: ${label}.index must be an integer.`)
  }
  if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight)) {
    throw new Error(`Import failed: ${label}.weight must be a number.`)
  }
  if (typeof entry.reps !== 'number' || !Number.isFinite(entry.reps)) {
    throw new Error(`Import failed: ${label}.reps must be a number.`)
  }
  if (typeof entry.isWarmup !== 'boolean') {
    throw new Error(`Import failed: ${label}.isWarmup must be a boolean.`)
  }
}

function validateReferences(data: WorkoutExport['data']): void {
  const exerciseIds = new Set(data.exercises.map((exercise) => exercise.id))
  const routineIds = new Set(data.routines.map((routine) => routine.id))
  const sessionIds = new Set(data.sessions.map((session) => session.id))

  data.routines.forEach((routine, routineIndex) => {
    routine.exerciseIds.forEach((exerciseId, exerciseIndex) => {
      if (!exerciseIds.has(exerciseId)) {
        throw new Error(
          `Import failed: data.routines[${routineIndex}].exerciseIds[${exerciseIndex}] references an unknown exercise.`,
        )
      }
    })
  })

  data.sessions.forEach((session, sessionIndex) => {
    if (session.routineId && !routineIds.has(session.routineId)) {
      throw new Error(
        `Import failed: data.sessions[${sessionIndex}].routineId references an unknown routine.`,
      )
    }
  })

  data.setEntries.forEach((entry, entryIndex) => {
    if (!sessionIds.has(entry.sessionId)) {
      throw new Error(
        `Import failed: data.setEntries[${entryIndex}].sessionId references an unknown session.`,
      )
    }
    if (!exerciseIds.has(entry.exerciseId)) {
      throw new Error(
        `Import failed: data.setEntries[${entryIndex}].exerciseId references an unknown exercise.`,
      )
    }
  })
}

function assertObject(value: unknown, label: string): void {
  if (!value || typeof value !== 'object') {
    throw new Error(`Import failed: ${label} must be an object.`)
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Import failed: ${label} must be an array.`)
  }
}

function toCsvRow(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value)
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
      }
      return text
    })
    .join(',')
}
