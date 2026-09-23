// ABOUTME: Defines IndexedDB schema and data-access functions for workout tracking state.
// ABOUTME: Provides routine, session, and set persistence helpers used by the mobile UI.
import Dexie, { type Table } from 'dexie'
import type {
  Exercise,
  ProgressionSettings,
  Routine,
  RoutineSplitId,
  SessionRecord,
  SetEntry,
  Unit,
  WorkoutExport,
} from '../types'
import { inferRoutineSplitId } from './routineSplit'
import { convertWeight } from './units'

export class WorkoutDatabase extends Dexie {
  exercises!: Table<Exercise, string>
  routines!: Table<Routine, string>
  sessions!: Table<SessionRecord, string>
  setEntries!: Table<SetEntry, string>

  constructor(name = 'workout-tracker') {
    super(name)
    this.version(1).stores({
      exercises: 'id,name',
      routines: 'id,name',
      sessions: 'id,startedAt,endedAt,routineId',
      setEntries: 'id,sessionId,exerciseId,[sessionId+exerciseId],index,completedAt',
    })
    this.version(2)
      .stores({
        exercises: 'id,name',
        routines: 'id,name,splitId',
        sessions: 'id,startedAt,endedAt,routineId',
        setEntries: 'id,sessionId,exerciseId,[sessionId+exerciseId],index,completedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('routines')
          .toCollection()
          .modify((routine: { name: string; splitId?: RoutineSplitId }) => {
            if (!routine.splitId) {
              routine.splitId = inferRoutineSplitId(routine.name)
            }
          })
      })
    this.version(3)
      .stores({
        exercises: 'id,name',
        routines: 'id,name,splitId',
        sessions: 'id,startedAt,endedAt,routineId',
        setEntries: 'id,sessionId,exerciseId,[sessionId+exerciseId],index,completedAt',
      })
      .upgrade(async (transaction) => {
        const exercises = await transaction.table<Exercise>('exercises').toArray()
        const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
        await transaction
          .table<SetEntry>('setEntries')
          .toCollection()
          .modify((set) => {
            if (!set.unit) {
              const exercise = exerciseById.get(set.exerciseId)
              set.unit =
                exercise?.progressionSettings.unit ?? exercise?.unitDefault ?? 'lb'
            }
          })
      })
  }
}

export const db = new WorkoutDatabase()
let ensureCoreRoutinesTask: Promise<void> | null = null
const coreRoutineBootstrapStateKey = 'workout-tracker.core-routines-bootstrap.v1'

interface CoreRoutineTemplate {
  splitId: RoutineSplitId
  name: string
  exerciseNames: string[]
}

const coreRoutineTemplates: CoreRoutineTemplate[] = [
  {
    splitId: '3-day-split',
    name: 'Push',
    exerciseNames: [
      'Barbell Bench Press',
      'Overhead Press',
      'Incline Dumbbell Press',
      'Lateral Raise',
      'Triceps Pushdown',
    ],
  },
  {
    splitId: '3-day-split',
    name: 'Pull',
    exerciseNames: [
      'Barbell Row',
      'Lat Pulldown',
      'Seated Cable Row',
      'Face Pull',
      'Dumbbell Curl',
    ],
  },
  {
    splitId: '3-day-split',
    name: 'Legs',
    exerciseNames: [
      'Back Squat',
      'Romanian Deadlift',
      'Leg Press',
      'Leg Curl',
      'Calf Raise',
    ],
  },
  {
    splitId: '4-day-split',
    name: 'Day 1 – Chest / Back / Biceps 1',
    exerciseNames: [
      'Bench Press',
      'Machine Row',
      'Incline Dumbbell Press',
      'Lat Pulldown',
      'Cable Row',
      'Barbell OR Dumbbell Curl',
    ],
  },
  {
    splitId: '4-day-split',
    name: 'Day 2 – Shoulders / Legs / Triceps 1',
    exerciseNames: [
      'Leg Press',
      'Shoulder Machine Press',
      'Romanian Deadlift',
      'Lateral Raise Variation',
      'Split Squat + Reverse Pec Dec',
      'Dumbbell Skull Crusher',
    ],
  },
  {
    splitId: '4-day-split',
    name: 'Day 3 – Chest / Back / Biceps 2',
    exerciseNames: [
      'Assisted Pull Ups',
      'Incline Bench Press',
      'Chest Supported Row',
      'Weighted Dips',
      'Machine Press OR Fly',
      'Incline Dumbbell Curl',
    ],
  },
  {
    splitId: '4-day-split',
    name: 'Day 4 – Shoulders / Legs / Triceps 2',
    exerciseNames: [
      'Standing Press',
      'Trap Bar Deadlift',
      'Lateral Raise Variation',
      'Leg Press',
      'Lying Hamstring Curl',
      'Tricep Pushdown',
    ],
  },
]

export function defaultProgressionSettings(unit: Unit): ProgressionSettings {
  return {
    repMin: 6,
    repMax: 10,
    workSetsTarget: 3,
    weightIncrement: unit === 'kg' ? 2.5 : 5,
    unit,
  }
}

export async function listExercises(): Promise<Exercise[]> {
  return db.exercises.orderBy('name').toArray()
}

export async function ensureCoreRoutines(unitDefault: Unit): Promise<void> {
  if (readCoreRoutineBootstrapState() === 'restored') {
    return
  }

  if (ensureCoreRoutinesTask) {
    return ensureCoreRoutinesTask
  }

  ensureCoreRoutinesTask = ensureCoreRoutinesInternal(unitDefault).finally(() => {
    ensureCoreRoutinesTask = null
  })

  return ensureCoreRoutinesTask
}

export function markCoreRoutinesRestored(): void {
  localStorage.setItem(coreRoutineBootstrapStateKey, 'restored')
}

async function ensureCoreRoutinesInternal(unitDefault: Unit): Promise<void> {
  const existingExercises = await db.exercises.toArray()
  const existingRoutines = await db.routines.toArray()

  const exerciseByName = new Map(
    existingExercises.map((exercise) => [exercise.name.toLowerCase(), exercise]),
  )
  const routineByName = new Map(
    existingRoutines.map((routine) => [
      toSplitRoutineKey(
        normalizeRoutineSplitId(routine.splitId, routine.name),
        routine.name,
      ),
      routine,
    ]),
  )
  const existingRoutineSplits = new Set<RoutineSplitId>(
    existingRoutines.map((routine) =>
      normalizeRoutineSplitId(routine.splitId, routine.name),
    ),
  )
  const splitsToSeed = new Set<RoutineSplitId>()
  for (const template of coreRoutineTemplates) {
    if (!existingRoutineSplits.has(template.splitId)) {
      splitsToSeed.add(template.splitId)
    }
  }

  for (const template of coreRoutineTemplates) {
    if (!splitsToSeed.has(template.splitId)) {
      continue
    }
    const exerciseIds: string[] = []

    for (const exerciseName of template.exerciseNames) {
      const key = exerciseName.toLowerCase()
      let exercise = exerciseByName.get(key)

      if (!exercise) {
        exercise = await createExercise({
          name: exerciseName,
          unitDefault,
        })
        exerciseByName.set(key, exercise)
      }

      exerciseIds.push(exercise.id)
    }

    const routineKey = toSplitRoutineKey(template.splitId, template.name)

    if (!routineByName.has(routineKey)) {
      const routine = await createRoutine(template.name, exerciseIds, template.splitId)
      routineByName.set(routineKey, routine)
    }
  }
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

interface ExerciseInput {
  name: string
  equipment?: string
  unitDefault: Unit
}

export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const exercise: Exercise = {
    id: createId(),
    name: input.name.trim(),
    equipment: input.equipment?.trim() || undefined,
    unitDefault: input.unitDefault,
    progressionSettings: defaultProgressionSettings(input.unitDefault),
  }
  await db.exercises.add(exercise)
  return exercise
}

export async function updateExercise(
  id: string,
  patch: Partial<Omit<Exercise, 'id'>>,
): Promise<void> {
  await db.exercises.update(id, patch)
}

export async function listRoutines(): Promise<Routine[]> {
  return db.routines.orderBy('name').toArray()
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return db.routines.get(id)
}

export async function createRoutine(
  name: string,
  exerciseIds: string[],
  splitId: RoutineSplitId = '3-day-split',
): Promise<Routine> {
  const routine: Routine = {
    id: createId(),
    name: name.trim(),
    splitId,
    exerciseIds,
  }
  await db.routines.add(routine)
  return routine
}

export async function updateRoutine(
  id: string,
  patch: Partial<Omit<Routine, 'id'>>,
): Promise<void> {
  await db.routines.update(id, patch)
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.delete(id)
}

export async function startSession(routineId?: string): Promise<SessionRecord> {
  const session: SessionRecord = {
    id: createId(),
    startedAt: new Date().toISOString(),
    routineId,
  }
  await db.sessions.add(session)
  return session
}

export async function endSession(sessionId: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) throw new Error('Workout not found.')
    if (!session.endedAt) {
      await db.sessions.update(sessionId, { endedAt: new Date().toISOString() })
    }
  })
}

export async function assignRoutineToSession(
  sessionId: string,
  routineId: string,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.routines, db.setEntries, async () => {
    const session = await requireActiveSession(sessionId)
    const routine = await db.routines.get(routineId)
    if (!routine) throw new Error('Routine not found.')
    await db.sessions.update(sessionId, {
      routineId,
      exerciseIds: session.exerciseIds ?? [
        ...new Set([
          ...routine.exerciseIds,
          ...(await listSessionExerciseIds(sessionId)),
        ]),
      ],
    })
  })
}

export async function updateSessionExercises(
  sessionId: string,
  exerciseIds: string[],
): Promise<void> {
  await db.transaction('rw', db.sessions, db.exercises, async () => {
    await requireActiveSession(sessionId)
    const uniqueIds = [...new Set(exerciseIds)]
    const exercises = await db.exercises.bulkGet(uniqueIds)
    if (exercises.some((exercise) => !exercise)) throw new Error('Exercise not found.')
    await db.sessions.update(sessionId, { exerciseIds: uniqueIds })
  })
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id)
}

export async function getActiveSession(): Promise<SessionRecord | undefined> {
  const sessions = await db.sessions.filter((session) => !session.endedAt).toArray()

  sessions.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  return sessions.at(-1)
}

export async function getOrCreateTrackerSession(): Promise<SessionRecord> {
  return db.transaction('rw', db.sessions, async () => {
    const activeSession = await getActiveSession()
    return activeSession ?? startSession()
  })
}

export async function listSessionSetEntries(sessionId: string): Promise<SetEntry[]> {
  const entries = await db.setEntries.where('sessionId').equals(sessionId).toArray()
  return entries.sort((a, b) => {
    if (a.exerciseId === b.exerciseId) {
      return a.index - b.index
    }
    return a.exerciseId.localeCompare(b.exerciseId)
  })
}

export async function listSessionExerciseEntries(
  sessionId: string,
  exerciseId: string,
): Promise<SetEntry[]> {
  const entries = await db.setEntries
    .where('[sessionId+exerciseId]')
    .equals([sessionId, exerciseId])
    .toArray()

  return entries.sort((a, b) => a.index - b.index)
}

interface AddSetEntryInput {
  id?: string
  weight: number
  reps: number
  unit?: Unit
  isWarmup?: boolean
  completed?: boolean
}

export async function addSetEntry(
  sessionId: string,
  exerciseId: string,
  input: AddSetEntryInput,
): Promise<SetEntry> {
  validateSetValues(input.weight, input.reps, input.completed ?? false)
  return db.transaction('rw', db.sessions, db.exercises, db.setEntries, async () => {
    if (input.id) {
      const saved = await db.setEntries.get(input.id)
      if (saved) {
        if (saved.sessionId !== sessionId || saved.exerciseId !== exerciseId) {
          throw new Error('Set identity belongs to another exercise.')
        }
        if (!saved.completedAt && input.completed) {
          await requireActiveSession(sessionId)
          const completed: SetEntry = {
            ...saved,
            weight: input.weight,
            reps: input.reps,
            unit: input.unit ?? saved.unit,
            isWarmup: input.isWarmup ?? saved.isWarmup,
            completedAt: new Date().toISOString(),
          }
          await db.setEntries.put(completed)
          return completed
        }
        return saved
      }
    }
    await requireActiveSession(sessionId)
    const exercise = await db.exercises.get(exerciseId)
    if (!exercise) throw new Error('Exercise not found.')
    const existingEntries = await listSessionExerciseEntries(sessionId, exerciseId)
    const entry: SetEntry = {
      id: input.id ?? createId(),
      sessionId,
      exerciseId,
      index: (existingEntries.at(-1)?.index ?? -1) + 1,
      weight: input.weight,
      reps: input.reps,
      unit: input.unit ?? exercise.progressionSettings.unit,
      isWarmup: input.isWarmup ?? false,
      completedAt: input.completed ? new Date().toISOString() : undefined,
    }
    await db.setEntries.add(entry)
    return entry
  })
}

interface SessionSetInput {
  weight: number
  reps: number
  unit?: Unit
}

export async function updateCompletedSetEntry(
  id: string,
  set: SessionSetInput,
): Promise<SetEntry> {
  validateSetValues(set.weight, set.reps, true)
  return db.transaction('rw', db.setEntries, async () => {
    const entry = await db.setEntries.get(id)
    if (!entry?.completedAt) throw new Error('Completed set not found.')
    const updated = {
      ...entry,
      weight: set.weight,
      reps: set.reps,
      unit: set.unit ?? entry.unit,
    }
    await db.setEntries.put(updated)
    return updated
  })
}

export async function saveSessionExerciseSet(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  set: SessionSetInput,
): Promise<SetEntry> {
  validateSetValues(set.weight, set.reps, false)
  return db.transaction('rw', db.sessions, db.exercises, db.setEntries, async () => {
    await requireActiveSession(sessionId)
    const entries = await listSessionExerciseEntries(sessionId, exerciseId)
    const existing = entries.find((entry) => entry.index === setIndex)

    if (existing) {
      const updated = {
        ...existing,
        weight: set.weight,
        reps: set.reps,
        unit: set.unit ?? existing.unit,
      }
      if (existing.completedAt) validateSetValues(set.weight, set.reps, true)
      await db.setEntries.put(updated)
      return updated
    }

    for (let index = entries.length; index < setIndex; index += 1) {
      await addSetEntry(sessionId, exerciseId, { weight: 0, reps: 0, completed: false })
    }
    return addSetEntry(sessionId, exerciseId, { ...set, completed: false })
  })
}

export async function applySessionExerciseTemplate(
  sessionId: string,
  exerciseId: string,
  sets: SessionSetInput[],
): Promise<void> {
  sets.forEach((set) => validateSetValues(set.weight, set.reps, false))
  await db.transaction('rw', db.sessions, db.exercises, db.setEntries, async () => {
    await requireActiveSession(sessionId)
    const existing = await listSessionExerciseEntries(sessionId, exerciseId)
    await db.setEntries.bulkDelete(
      existing.filter((entry) => !entry.completedAt).map((entry) => entry.id),
    )
    for (const set of sets) {
      await addSetEntry(sessionId, exerciseId, { ...set, completed: false })
    }
  })
}

export async function deleteSessionSet(
  sessionId: string,
  exerciseId: string,
  setId: string,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.setEntries, async () => {
    await requireActiveSession(sessionId)
    const entry = await db.setEntries.get(setId)
    if (!entry || entry.sessionId !== sessionId || entry.exerciseId !== exerciseId) {
      throw new Error('Set not found in this exercise.')
    }
    await db.setEntries.delete(setId)

    const remaining = await db.setEntries
      .where('[sessionId+exerciseId]')
      .equals([sessionId, exerciseId])
      .toArray()

    remaining.sort((a, b) => a.index - b.index)

    for (let index = 0; index < remaining.length; index += 1) {
      if (remaining[index].index !== index) {
        await db.setEntries.update(remaining[index].id, { index })
      }
    }
  })
}

export async function removeExerciseFromSession(
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.setEntries, async () => {
    const session = await requireActiveSession(sessionId)
    const exerciseIds = session.exerciseIds ?? (await listSessionExerciseIds(sessionId))
    await db.sessions.update(sessionId, {
      exerciseIds: exerciseIds.filter((id) => id !== exerciseId),
    })
  })
}

export async function listSessionExerciseIds(sessionId: string): Promise<string[]> {
  const entries = await db.setEntries.where('sessionId').equals(sessionId).toArray()
  const ordered = entries.sort((a, b) => a.index - b.index)
  const seen = new Set<string>()

  for (const entry of ordered) {
    seen.add(entry.exerciseId)
  }

  return Array.from(seen)
}

export async function addSetWithPrefill(
  sessionId: string,
  exerciseId: string,
): Promise<SetEntry> {
  const nextIndex = (await listSessionExerciseEntries(sessionId, exerciseId)).length
  const prefill = await getSetInputPrefillFromLastSession(exerciseId, nextIndex)
  return addSetEntry(sessionId, exerciseId, {
    weight: prefill?.weight ?? 0,
    reps: prefill?.reps ?? 0,
  })
}

export async function copyPreviousSet(
  sessionId: string,
  exerciseId: string,
): Promise<SetEntry | null> {
  return db.transaction('rw', db.sessions, db.exercises, db.setEntries, async () => {
    const previous = (await listSessionExerciseEntries(sessionId, exerciseId)).at(-1)
    if (!previous) return null
    return addSetEntry(sessionId, exerciseId, {
      weight: previous.weight,
      reps: previous.reps,
      unit: previous.unit,
      isWarmup: previous.isWarmup,
    })
  })
}

interface SetEntryPatch {
  weight?: number
  reps?: number
  isWarmup?: boolean
  completedAt?: string
}

export async function updateSetEntry(id: string, patch: SetEntryPatch): Promise<void> {
  await db.transaction('rw', db.sessions, db.setEntries, async () => {
    const entry = await db.setEntries.get(id)
    if (!entry) throw new Error('Set not found.')
    await requireActiveSession(entry.sessionId)
    const updated = { ...entry, ...patch }
    validateSetValues(updated.weight, updated.reps, Boolean(updated.completedAt))
    await db.setEntries.put(updated)
  })
}

export async function markSetComplete(id: string, isComplete: boolean): Promise<void> {
  await updateSetEntry(id, {
    completedAt: isComplete ? new Date().toISOString() : undefined,
  })
}

export async function getLastCompletedSessionForExercise(
  exerciseId: string,
): Promise<{ session: SessionRecord; sets: SetEntry[] } | null> {
  const history = await listExerciseHistory(exerciseId)
  return history.find((row) => row.sets.some((set) => !set.isWarmup)) ?? null
}

export async function listExerciseHistory(
  exerciseId: string,
  limit?: number,
): Promise<Array<{ session: SessionRecord; sets: SetEntry[] }>> {
  const entries = await db.setEntries
    .where('exerciseId')
    .equals(exerciseId)
    .filter(
      (entry) =>
        Boolean(entry.completedAt) &&
        Number.isFinite(entry.weight) &&
        entry.weight >= 0 &&
        Number.isInteger(entry.reps) &&
        entry.reps > 0,
    )
    .toArray()

  if (entries.length === 0) {
    return []
  }

  const entryMap = new Map<string, SetEntry[]>()
  for (const entry of entries) {
    const list = entryMap.get(entry.sessionId) ?? []
    list.push(entry)
    entryMap.set(entry.sessionId, list)
  }

  const sessions = await db.sessions.bulkGet(Array.from(entryMap.keys()))

  const sortedSessions = sessions
    .filter((session): session is SessionRecord => Boolean(session?.endedAt))
    .sort((left, right) => {
      const leftTimestamp = getSessionSortTimestamp(left, entryMap.get(left.id) ?? [])
      const rightTimestamp = getSessionSortTimestamp(right, entryMap.get(right.id) ?? [])
      return Date.parse(rightTimestamp) - Date.parse(leftTimestamp)
    })

  const visibleSessions =
    typeof limit === 'number' ? sortedSessions.slice(0, limit) : sortedSessions

  return visibleSessions.map((session) => ({
    session,
    sets: (entryMap.get(session.id) ?? []).sort((a, b) => a.index - b.index),
  }))
}

function getSessionSortTimestamp(session: SessionRecord, sets: SetEntry[]): string {
  const completedTimes = sets
    .map((set) => set.completedAt)
    .filter((value): value is string => Boolean(value))

  if (completedTimes.length > 0) {
    completedTimes.sort((a, b) => Date.parse(b) - Date.parse(a))
    return completedTimes[0]
  }

  return session.endedAt ?? session.startedAt
}

export async function readFullExportData(): Promise<WorkoutExport['data']> {
  return db.transaction(
    'r',
    db.exercises,
    db.routines,
    db.sessions,
    db.setEntries,
    async () => {
      const [exercises, routines, sessions, setEntries] = await Promise.all([
        db.exercises.toArray(),
        db.routines.toArray(),
        db.sessions.toArray(),
        db.setEntries.toArray(),
      ])
      return { exercises, routines, sessions, setEntries }
    },
  )
}

export async function importFullExportData(
  data: WorkoutExport['data'],
  beforeCommit?: () => void,
): Promise<void> {
  // Import must be transactional to avoid partial writes when validation passes but writes fail.
  await db.transaction(
    'rw',
    db.exercises,
    db.routines,
    db.sessions,
    db.setEntries,
    async () => {
      await Promise.all([
        db.setEntries.clear(),
        db.sessions.clear(),
        db.routines.clear(),
        db.exercises.clear(),
      ])

      if (data.exercises.length > 0) {
        await db.exercises.bulkAdd(data.exercises)
      }
      if (data.routines.length > 0) {
        const routines = data.routines.map((routine) => ({
          ...routine,
          splitId: normalizeRoutineSplitId(routine.splitId, routine.name),
        }))
        await db.routines.bulkAdd(routines)
      }
      if (data.sessions.length > 0) {
        await db.sessions.bulkAdd(data.sessions)
      }
      if (data.setEntries.length > 0) {
        const exerciseById = new Map(
          data.exercises.map((exercise) => [exercise.id, exercise]),
        )
        await db.setEntries.bulkAdd(
          data.setEntries.map((set) => ({
            ...set,
            unit:
              set.unit ??
              exerciseById.get(set.exerciseId)?.progressionSettings.unit ??
              'lb',
          })),
        )
      }
      beforeCommit?.()
    },
  )
}

export async function getSetInputPrefillFromLastSession(
  exerciseId: string,
  nextIndex: number,
): Promise<{ weight: number; reps: number } | null> {
  const history = await getLastCompletedSessionForExercise(exerciseId)
  if (!history) {
    return null
  }

  const workSets = history.sets.filter((set) => !set.isWarmup)
  if (workSets.length === 0) {
    return null
  }

  const sourceSet = workSets[nextIndex] ?? workSets.at(-1) ?? workSets[0]
  const exercise = await db.exercises.get(exerciseId)
  const unit = exercise?.progressionSettings.unit ?? sourceSet.unit ?? 'lb'
  return {
    weight: convertWeight(sourceSet.weight, sourceSet.unit ?? unit, unit),
    reps: sourceSet.reps,
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

async function requireActiveSession(sessionId: string): Promise<SessionRecord> {
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('Workout not found.')
  if (session.endedAt) throw new Error('This workout is finished.')
  return session
}

function validateSetValues(weight: number, reps: number, completed: boolean): void {
  if (!Number.isFinite(weight) || weight < 0)
    throw new Error('Weight must be zero or greater.')
  if (!Number.isInteger(reps) || reps < (completed ? 1 : 0)) {
    throw new Error(
      completed
        ? 'Reps must be a positive whole number.'
        : 'Reps must be a non-negative whole number.',
    )
  }
}

function toSplitRoutineKey(splitId: RoutineSplitId, name: string): string {
  return `${splitId}:${name.toLowerCase()}`
}

function readCoreRoutineBootstrapState(): string {
  return localStorage.getItem(coreRoutineBootstrapStateKey) ?? ''
}

function normalizeRoutineSplitId(splitId: unknown, name: string): RoutineSplitId {
  if (splitId === '3-day-split' || splitId === '4-day-split') {
    return splitId
  }

  return inferRoutineSplitId(name)
}
