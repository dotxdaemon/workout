import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSetEntry,
  addSetWithPrefill,
  createExercise,
  db,
  ensureCoreRoutines,
  endSession,
  getOrCreateTrackerSession,
  getSession,
  getSetInputPrefillFromLastSession,
  listExercises,
  listRoutines,
  getLastCompletedSessionForExercise,
  listExerciseHistory,
  markSetComplete,
  removeExerciseFromSession,
  listSessionSetEntries,
  startSession,
  updateSetEntry,
} from './db'

describe('IndexedDB integration', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.exercises, db.routines, db.sessions, db.setEntries, async () => {
      await db.setEntries.clear()
      await db.sessions.clear()
      await db.routines.clear()
      await db.exercises.clear()
    })
  })

  it('writes and reads exercise session data with set prefill from last completed session', async () => {
    const exercise = await createExercise({
      name: 'Back Squat',
      unitDefault: 'lb',
    })

    const firstSession = await startSession()
    const firstSet = await addSetWithPrefill(firstSession.id, exercise.id)

    expect(firstSet.weight).toBe(0)
    expect(firstSet.reps).toBe(0)

    await updateSetEntry(firstSet.id, {
      weight: 225,
      reps: 8,
    })
    await markSetComplete(firstSet.id, true)
    await endSession(firstSession.id)

    const secondSession = await startSession()
    const secondSet = await addSetWithPrefill(secondSession.id, exercise.id)

    expect(secondSet.weight).toBe(225)
    expect(secondSet.reps).toBe(8)

    const history = await listExerciseHistory(exercise.id, 10)
    expect(history).toHaveLength(1)

    const lastCompleted = await getLastCompletedSessionForExercise(exercise.id)
    expect(lastCompleted?.session.id).toBe(firstSession.id)
    expect(lastCompleted?.sets).toHaveLength(1)
  })

  it('seeds push, pull, and legs routines for easy day selection', async () => {
    await ensureCoreRoutines('lb')

    const routines = await listRoutines()
    const exercises = await listExercises()

    expect(routines.map((routine) => routine.name).sort()).toEqual([
      'Legs',
      'Pull',
      'Push',
    ])
    expect(exercises.length).toBeGreaterThan(0)
    expect(routines.every((routine) => routine.exerciseIds.length > 0)).toBe(true)
  })

  it('can prefill inline set input and remove an exercise from the session list', async () => {
    const exercise = await createExercise({
      name: 'Incline Press',
      unitDefault: 'lb',
    })

    const firstSession = await startSession()
    await addSetEntry(firstSession.id, exercise.id, {
      weight: 115,
      reps: 8,
      completed: true,
    })
    await endSession(firstSession.id)

    const secondSession = await startSession()
    await addSetEntry(secondSession.id, exercise.id, {
      weight: 120,
      reps: 7,
      completed: true,
    })

    const prefill = await getSetInputPrefillFromLastSession(exercise.id, 1)
    expect(prefill).toEqual({
      weight: 115,
      reps: 8,
    })

    await removeExerciseFromSession(secondSession.id, exercise.id)

    const remaining = await listSessionSetEntries(secondSession.id)
    expect(remaining).toHaveLength(0)
  })

  it('creates a hidden tracker session and rolls to a new day automatically', async () => {
    const first = await getOrCreateTrackerSession()
    const second = await getOrCreateTrackerSession()

    expect(second.id).toBe(first.id)

    await db.sessions.update(first.id, {
      startedAt: '2000-01-01T00:00:00.000Z',
    })

    const rotated = await getOrCreateTrackerSession()
    expect(rotated.id).not.toBe(first.id)

    const old = await getSession(first.id)
    expect(old?.endedAt).toBeDefined()
  })
})
