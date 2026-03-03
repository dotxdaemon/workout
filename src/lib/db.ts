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

class WorkoutDatabase extends Dexie {
  exercises!: Table<Exercise, string>
  routines!: Table<Routine, string>
  sessions!: Table<SessionRecord, string>
  setEntries!: Table<SetEntry, string>

  constructor() {
    super('workout-tracker')
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
  }
}

export const db = new WorkoutDatabase()
let ensureCoreRoutinesTask: Promise<void> | null = null

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
  if (ensureCoreRoutinesTask) {
    return ensureCoreRoutinesTask
  }

  ensureCoreRoutinesTask = ensureCoreRoutinesInternal(unitDefault).finally(() => {
    ensureCoreRoutinesTask = null
  })

  return ensureCoreRoutinesTask
}

async function ensureCoreRoutinesInternal(unitDefault: Unit): Promise<void> {
  await repairSeedDuplicates()

  const existingExercises = await db.exercises.toArray()
  const existingRoutines = await db.routines.toArray()

  const exerciseByName = new Map(
    existingExercises.map((exercise) => [exercise.name.toLowerCase(), exercise]),
  )
  const routineByName = new Map(
    existingRoutines.map((routine) => [
      toSplitRoutineKey(normalizeRoutineSplitId(routine.splitId, routine.name), routine.name),
      routine,
    ]),
  )
  const existingRoutineSplits = new Set<RoutineSplitId>(
    existingRoutines.map((routine) => normalizeRoutineSplitId(routine.splitId, routine.name)),
  )
  const splitsToSeed = new Set<RoutineSplitId>()
  for (const template of coreRoutineTemplates) {
    if (!existingRoutineSplits.has(template.splitId)) {
      splitsToSeed.add(template.splitId)
    }
  }

  for (const template of coreRoutineTemplates) {
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

    if (splitsToSeed.has(template.splitId) && !routineByName.has(routineKey)) {
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
  await db.sessions.update(sessionId, {
    endedAt: new Date().toISOString(),
  })
}

export async function assignRoutineToSession(
  sessionId: string,
  routineId: string,
): Promise<void> {
  await db.sessions.update(sessionId, {
    routineId,
  })
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id)
}

export async function getActiveSession(): Promise<SessionRecord | undefined> {
  const sessions = await db.sessions
    .filter((session) => !session.endedAt)
    .sortBy('startedAt')

  return sessions.at(-1)
}

export async function getOrCreateTrackerSession(): Promise<SessionRecord> {
  const sessions = await db.sessions
    .filter((session) => !session.endedAt)
    .sortBy('startedAt')

  const activeSession = sessions.at(-1)
  if (!activeSession) {
    return startSession()
  }

  if (isSameLocalDate(new Date(activeSession.startedAt), new Date())) {
    return activeSession
  }

  await endSession(activeSession.id)
  return startSession()
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
  weight: number
  reps: number
  isWarmup?: boolean
  completed?: boolean
}

export async function addSetEntry(
  sessionId: string,
  exerciseId: string,
  input: AddSetEntryInput,
): Promise<SetEntry> {
  const existingEntries = await listSessionExerciseEntries(sessionId, exerciseId)
  const entry: SetEntry = {
    id: createId(),
    sessionId,
    exerciseId,
    index: existingEntries.length,
    weight: input.weight,
    reps: input.reps,
    isWarmup: input.isWarmup ?? false,
    completedAt: input.completed ? new Date().toISOString() : undefined,
  }

  await db.setEntries.add(entry)
  return entry
}

interface SessionSetInput {
  weight: number
  reps: number
}

export async function saveSessionExerciseSet(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  set: SessionSetInput,
): Promise<SetEntry> {
  const entries = await listSessionExerciseEntries(sessionId, exerciseId)
  const existing = entries.find((entry) => entry.index === setIndex)

  if (existing) {
    await db.setEntries.update(existing.id, {
      weight: set.weight,
      reps: set.reps,
      completedAt: undefined,
    })

    return {
      ...existing,
      weight: set.weight,
      reps: set.reps,
      completedAt: undefined,
    }
  }

  for (let index = entries.length; index < setIndex; index += 1) {
    await addSetEntry(sessionId, exerciseId, {
      weight: 0,
      reps: 0,
      completed: false,
    })
  }

  return addSetEntry(sessionId, exerciseId, {
    weight: set.weight,
    reps: set.reps,
    completed: false,
  })
}

export async function applySessionExerciseTemplate(
  sessionId: string,
  exerciseId: string,
  sets: SessionSetInput[],
): Promise<void> {
  const existing = await listSessionExerciseEntries(sessionId, exerciseId)
  if (existing.length > 0) {
    await db.setEntries.bulkDelete(existing.map((entry) => entry.id))
  }

  if (sets.length === 0) {
    return
  }

  const templateEntries: SetEntry[] = sets.map((set, index) => ({
    id: createId(),
    sessionId,
    exerciseId,
    index,
    weight: set.weight,
    reps: set.reps,
    isWarmup: false,
    completedAt: undefined,
  }))

  await db.setEntries.bulkAdd(templateEntries)
}

export async function removeExerciseFromSession(
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  const entries = await db.setEntries
    .where('[sessionId+exerciseId]')
    .equals([sessionId, exerciseId])
    .toArray()

  if (entries.length === 0) {
    return
  }

  await db.setEntries.bulkDelete(entries.map((entry) => entry.id))
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
  const existingEntries = await listSessionExerciseEntries(sessionId, exerciseId)
  const nextIndex = existingEntries.length
  const prefill = await getSetInputPrefillFromLastSession(exerciseId, nextIndex)

  const entry: SetEntry = {
    id: createId(),
    sessionId,
    exerciseId,
    index: nextIndex,
    weight: prefill?.weight ?? 0,
    reps: prefill?.reps ?? 0,
    isWarmup: false,
  }

  await db.setEntries.add(entry)
  return entry
}

export async function copyPreviousSet(
  sessionId: string,
  exerciseId: string,
): Promise<SetEntry | null> {
  const existingEntries = await listSessionExerciseEntries(sessionId, exerciseId)
  const previous = existingEntries.at(-1)
  if (!previous) {
    return null
  }

  const entry: SetEntry = {
    ...previous,
    id: createId(),
    index: previous.index + 1,
    completedAt: undefined,
  }

  await db.setEntries.add(entry)
  return entry
}

interface SetEntryPatch {
  weight?: number
  reps?: number
  isWarmup?: boolean
  completedAt?: string
}

export async function updateSetEntry(id: string, patch: SetEntryPatch): Promise<void> {
  await db.setEntries.update(id, patch)
}

export async function markSetComplete(
  id: string,
  isComplete: boolean,
): Promise<void> {
  await db.setEntries.update(id, {
    completedAt: isComplete ? new Date().toISOString() : undefined,
  })
}

export async function getLastCompletedSessionForExercise(
  exerciseId: string,
): Promise<{ session: SessionRecord; sets: SetEntry[] } | null> {
  const relatedExerciseIds = await getRelatedExerciseIds(exerciseId)
  const entries =
    relatedExerciseIds.length > 1
      ? await db.setEntries.where('exerciseId').anyOf(relatedExerciseIds).toArray()
      : await db.setEntries.where('exerciseId').equals(exerciseId).toArray()

  if (entries.length === 0) {
    return null
  }

  const sessionIds = Array.from(new Set(entries.map((entry) => entry.sessionId)))
  const sessions = await db.sessions.bulkGet(sessionIds)
  const completed = sessions
    .filter((session): session is SessionRecord => Boolean(session?.endedAt))
    .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))

  const session = completed[0]
  if (!session) {
    return null
  }

  const sets = entries
    .filter((entry) => entry.sessionId === session.id)
    .sort((a, b) => a.index - b.index)

  return {
    session,
    sets,
  }
}

export async function listExerciseHistory(
  exerciseId: string,
  limit = 10,
): Promise<Array<{ session: SessionRecord; sets: SetEntry[] }>> {
  const relatedExerciseIds = await getRelatedExerciseIds(exerciseId)
  const entries =
    relatedExerciseIds.length > 1
      ? await db.setEntries.where('exerciseId').anyOf(relatedExerciseIds).toArray()
      : await db.setEntries.where('exerciseId').equals(exerciseId).toArray()

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

  return sessions
    .filter((session): session is SessionRecord => Boolean(session))
    .sort((left, right) => {
      const leftTimestamp = getSessionSortTimestamp(left, entryMap.get(left.id) ?? [])
      const rightTimestamp = getSessionSortTimestamp(right, entryMap.get(right.id) ?? [])
      return rightTimestamp.localeCompare(leftTimestamp)
    })
    .slice(0, limit)
    .map((session) => ({
      session,
      sets: (entryMap.get(session.id) ?? []).sort((a, b) => a.index - b.index),
    }))
}

function getSessionSortTimestamp(session: SessionRecord, sets: SetEntry[]): string {
  const completedTimes = sets
    .map((set) => set.completedAt)
    .filter((value): value is string => Boolean(value))

  if (completedTimes.length > 0) {
    completedTimes.sort((a, b) => b.localeCompare(a))
    return completedTimes[0]
  }

  return session.endedAt ?? session.startedAt
}

export async function readFullExportData(): Promise<WorkoutExport['data']> {
  const [exercises, routines, sessions, setEntries] = await Promise.all([
    db.exercises.toArray(),
    db.routines.toArray(),
    db.sessions.toArray(),
    db.setEntries.toArray(),
  ])

  return {
    exercises,
    routines,
    sessions,
    setEntries,
  }
}

export async function importFullExportData(data: WorkoutExport['data']): Promise<void> {
  // Import must be transactional to avoid partial writes when validation passes but writes fail.
  await db.transaction('rw', db.exercises, db.routines, db.sessions, db.setEntries, async () => {
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
      await db.setEntries.bulkAdd(data.setEntries)
    }
  })
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
  return {
    weight: sourceSet.weight,
    reps: sourceSet.reps,
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function toSplitRoutineKey(splitId: RoutineSplitId, name: string): string {
  return `${splitId}:${name.toLowerCase()}`
}

function normalizeRoutineSplitId(splitId: unknown, name: string): RoutineSplitId {
  if (splitId === '3-day-split' || splitId === '4-day-split') {
    return splitId
  }

  return inferRoutineSplitId(name)
}

async function repairSeedDuplicates(): Promise<void> {
  await db.transaction('rw', db.exercises, db.routines, db.sessions, db.setEntries, async () => {
    const [exercises, routines, sessions] = await Promise.all([
      db.exercises.toArray(),
      db.routines.toArray(),
      db.sessions.toArray(),
    ])

    if (exercises.length === 0 && routines.length === 0) {
      return
    }

    const routineById = new Map(routines.map((routine) => [routine.id, routine]))

    const routineGroups = new Map<string, Routine[]>()
    const routineUsage = new Map<string, { count: number; latestStartedAt: string }>()
    for (const session of sessions) {
      if (!session.routineId) {
        continue
      }

      const existing = routineUsage.get(session.routineId)
      if (existing) {
        existing.count += 1
        if (session.startedAt > existing.latestStartedAt) {
          existing.latestStartedAt = session.startedAt
        }
      } else {
        routineUsage.set(session.routineId, {
          count: 1,
          latestStartedAt: session.startedAt,
        })
      }
    }

    for (const routine of routineById.values()) {
      const splitId = normalizeRoutineSplitId(routine.splitId, routine.name)
      if (splitId !== routine.splitId) {
        routine.splitId = splitId
        await db.routines.update(routine.id, {
          splitId,
        })
      }

      const key = toSplitRoutineKey(splitId, routine.name)
      const list = routineGroups.get(key) ?? []
      list.push(routine)
      routineGroups.set(key, list)
    }

    for (const groupedRoutines of routineGroups.values()) {
      if (groupedRoutines.length <= 1) {
        continue
      }

      const [canonical, ...duplicates] = [...groupedRoutines].sort((left, right) => {
        const leftUsage = routineUsage.get(left.id) ?? { count: 0, latestStartedAt: '' }
        const rightUsage = routineUsage.get(right.id) ?? { count: 0, latestStartedAt: '' }

        if (leftUsage.count !== rightUsage.count) {
          return rightUsage.count - leftUsage.count
        }
        if (leftUsage.latestStartedAt !== rightUsage.latestStartedAt) {
          return rightUsage.latestStartedAt.localeCompare(leftUsage.latestStartedAt)
        }
        return left.id.localeCompare(right.id)
      })

      for (const duplicate of duplicates) {
        await db.sessions.where('routineId').equals(duplicate.id).modify({
          routineId: canonical.id,
        })
        await db.routines.delete(duplicate.id)
      }
    }
  })
}

async function getRelatedExerciseIds(exerciseId: string): Promise<string[]> {
  return [exerciseId]
}
