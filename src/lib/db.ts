import Dexie, { type Table } from 'dexie'
import type {
  Exercise,
  ProgressionSettings,
  Routine,
  SessionRecord,
  SetEntry,
  Unit,
  WorkoutExport,
} from '../types'

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
  }
}

export const db = new WorkoutDatabase()

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

export async function createRoutine(name: string, exerciseIds: string[]): Promise<Routine> {
  const routine: Routine = {
    id: createId(),
    name: name.trim(),
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

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id)
}

export async function getActiveSession(): Promise<SessionRecord | undefined> {
  const sessions = await db.sessions
    .filter((session) => !session.endedAt)
    .sortBy('startedAt')

  return sessions.at(-1)
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
  const prefill = await getPrefillFromLastSession(exerciseId, nextIndex)

  const entry: SetEntry = {
    id: createId(),
    sessionId,
    exerciseId,
    index: nextIndex,
    weight: prefill.weight,
    reps: prefill.reps,
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
  const entries = await db.setEntries.where('exerciseId').equals(exerciseId).toArray()
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
  const entries = await db.setEntries.where('exerciseId').equals(exerciseId).toArray()
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
    .filter((session): session is SessionRecord => Boolean(session?.endedAt))
    .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))
    .slice(0, limit)
    .map((session) => ({
      session,
      sets: (entryMap.get(session.id) ?? []).sort((a, b) => a.index - b.index),
    }))
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
      await db.routines.bulkAdd(data.routines)
    }
    if (data.sessions.length > 0) {
      await db.sessions.bulkAdd(data.sessions)
    }
    if (data.setEntries.length > 0) {
      await db.setEntries.bulkAdd(data.setEntries)
    }
  })
}

async function getPrefillFromLastSession(
  exerciseId: string,
  nextIndex: number,
): Promise<{ weight: number; reps: number }> {
  const history = await getLastCompletedSessionForExercise(exerciseId)
  if (!history) {
    return {
      weight: 0,
      reps: 0,
    }
  }

  const workSets = history.sets.filter((set) => !set.isWarmup)
  if (workSets.length === 0) {
    return {
      weight: 0,
      reps: 0,
    }
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
