// ABOUTME: Integration tests for IndexedDB persistence and exercise/session workflows.
// ABOUTME: Validates session rotation, routine seeding, and set template persistence behavior.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applySessionExerciseTemplate,
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
  saveSessionExerciseSet,
  listSessionSetEntries,
  startSession,
  updateExercise,
  updateRoutine,
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
    await markSetComplete(secondSet.id, true)

    const history = await listExerciseHistory(exercise.id, 10)
    expect(history).toHaveLength(2)
    expect(history[0].session.id).toBe(secondSession.id)
    expect(history[1].session.id).toBe(firstSession.id)

    const lastCompleted = await getLastCompletedSessionForExercise(exercise.id)
    expect(lastCompleted?.session.id).toBe(firstSession.id)
    expect(lastCompleted?.sets).toHaveLength(1)
  })

  it('seeds both 3 day and 4 day split routines for easy split selection', async () => {
    await ensureCoreRoutines('lb')

    const routines = await listRoutines()
    const exercises = await listExercises()

    expect(routines.map((routine) => routine.name).sort()).toEqual([
      'Day 1 – Chest / Back / Biceps 1',
      'Day 2 – Shoulders / Legs / Triceps 1',
      'Day 3 – Chest / Back / Biceps 2',
      'Day 4 – Shoulders / Legs / Triceps 2',
      'Legs',
      'Pull',
      'Push',
    ])

    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(3)
    expect(routines.filter((routine) => routine.splitId === '4-day-split')).toHaveLength(4)

    expect(exercises.length).toBeGreaterThan(0)
    expect(routines.every((routine) => routine.exerciseIds.length > 0)).toBe(true)
  })

  it('prevents duplicate seed data when routine setup runs concurrently', async () => {
    await Promise.all([ensureCoreRoutines('lb'), ensureCoreRoutines('lb')])

    const routines = await listRoutines()

    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(3)
    expect(routines.filter((routine) => routine.splitId === '4-day-split')).toHaveLength(4)
  })

  it('does not recreate a renamed seeded routine when setup runs again', async () => {
    await ensureCoreRoutines('lb')
    const seeded = await listRoutines()
    const pushRoutine = seeded.find(
      (routine) => routine.splitId === '3-day-split' && routine.name === 'Push',
    )

    expect(pushRoutine).toBeDefined()

    await updateRoutine(pushRoutine!.id, {
      name: 'Push QA',
    })

    await ensureCoreRoutines('lb')

    const routines = await listRoutines()
    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(3)
    expect(routines.some((routine) => routine.splitId === '3-day-split' && routine.name === 'Push')).toBe(false)
    expect(routines.some((routine) => routine.splitId === '3-day-split' && routine.name === 'Push QA')).toBe(true)
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

  it('autosaves set edits and can replace an exercise with a session template', async () => {
    const exercise = await createExercise({
      name: 'Flat Bench Press',
      unitDefault: 'lb',
    })

    const session = await startSession()
    await saveSessionExerciseSet(session.id, exercise.id, 0, {
      weight: 185,
      reps: 8,
    })
    await saveSessionExerciseSet(session.id, exercise.id, 0, {
      weight: 185,
      reps: 9,
    })

    let entries = await listSessionSetEntries(session.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].reps).toBe(9)

    await applySessionExerciseTemplate(session.id, exercise.id, [
      { weight: 190, reps: 6 },
      { weight: 190, reps: 6 },
      { weight: 190, reps: 6 },
    ])

    entries = await listSessionSetEntries(session.id)
      .then((rows) => rows.filter((row) => row.exerciseId === exercise.id))
    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(entries.map((entry) => [entry.weight, entry.reps])).toEqual([
      [190, 6],
      [190, 6],
      [190, 6],
    ])
    expect(entries.every((entry) => !entry.completedAt)).toBe(true)
  })

  it('includes active session entries in exercise history', async () => {
    const exercise = await createExercise({
      name: 'Pendlay Row',
      unitDefault: 'lb',
    })

    const session = await startSession()
    await addSetEntry(session.id, exercise.id, {
      weight: 165,
      reps: 6,
      completed: true,
    })

    const history = await listExerciseHistory(exercise.id, 5)
    expect(history).toHaveLength(1)
    expect(history[0].session.id).toBe(session.id)
    expect(history[0].session.endedAt).toBeUndefined()
    expect(history[0].sets.map((set) => [set.weight, set.reps])).toEqual([[165, 6]])
  })

  it('returns every exercise history session when no limit is provided', async () => {
    const exercise = await createExercise({
      name: 'Cable Fly',
      unitDefault: 'lb',
    })

    const baseTimestamp = Date.parse('2026-03-01T12:00:00.000Z')

    await db.transaction('rw', db.sessions, db.setEntries, async () => {
      for (let index = 0; index < 7; index += 1) {
        const completedAt = new Date(baseTimestamp + index * 60_000).toISOString()
        const sessionId = `history-session-${index}`

        await db.sessions.add({
          id: sessionId,
          startedAt: completedAt,
          endedAt: completedAt,
        })

        await db.setEntries.add({
          id: `history-set-${index}`,
          sessionId,
          exerciseId: exercise.id,
          index: 0,
          weight: 40 + index,
          reps: 10 + index,
          isWarmup: false,
          completedAt,
        })
      }
    })

    const history = await listExerciseHistory(exercise.id)

    expect(history).toHaveLength(7)
    expect(history.map((row) => row.session.id)).toEqual([
      'history-session-6',
      'history-session-5',
      'history-session-4',
      'history-session-3',
      'history-session-2',
      'history-session-1',
      'history-session-0',
    ])
  })

  it('links exact-name exercises for history, prefills, and settings only', async () => {
    const first = await createExercise({
      name: 'Leg Extension',
      unitDefault: 'lb',
    })
    const second = await createExercise({
      name: 'Leg Extension',
      unitDefault: 'lb',
    })
    const differentCase = await createExercise({
      name: 'leg extension',
      unitDefault: 'lb',
    })

    const firstSession = await startSession()
    await addSetEntry(firstSession.id, first.id, {
      weight: 315,
      reps: 10,
      completed: true,
    })
    await endSession(firstSession.id)

    const firstHistory = await listExerciseHistory(first.id, 5)
    const secondHistory = await listExerciseHistory(second.id, 5)
    const differentCaseHistory = await listExerciseHistory(differentCase.id, 5)
    const secondPrefill = await getSetInputPrefillFromLastSession(second.id, 0)

    expect(firstHistory).toHaveLength(1)
    expect(secondHistory).toHaveLength(1)
    expect(differentCaseHistory).toHaveLength(0)
    expect(secondPrefill).toEqual({
      weight: 315,
      reps: 10,
    })
    expect(firstHistory[0].sets.map((set) => [set.exerciseId, set.weight, set.reps])).toEqual([
      [first.id, 315, 10],
    ])
    expect(secondHistory[0].sets.map((set) => [set.exerciseId, set.weight, set.reps])).toEqual([
      [first.id, 315, 10],
    ])

    await updateExercise(first.id, {
      equipment: 'Machine',
      unitDefault: 'kg',
      progressionSettings: {
        ...first.progressionSettings,
        repMin: 8,
        repMax: 12,
        workSetsTarget: 4,
        weightIncrement: 5,
        unit: 'kg',
      },
    })

    const exercises = await listExercises()
    const updatedSecond = exercises.find((exercise) => exercise.id === second.id)
    const unchangedDifferentCase = exercises.find((exercise) => exercise.id === differentCase.id)

    expect(updatedSecond).toMatchObject({
      equipment: 'Machine',
      unitDefault: 'kg',
      progressionSettings: {
        ...second.progressionSettings,
        repMin: 8,
        repMax: 12,
        workSetsTarget: 4,
        weightIncrement: 5,
        unit: 'kg',
      },
    })
    expect(unchangedDifferentCase).toMatchObject({
      equipment: undefined,
      unitDefault: 'lb',
      progressionSettings: {
        ...differentCase.progressionSettings,
        unit: 'lb',
      },
    })
  })
})
