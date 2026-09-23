// ABOUTME: Integration tests for IndexedDB persistence and exercise/session workflows.
// ABOUTME: Validates session rotation, routine seeding, and set template persistence behavior.
import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import {
  applySessionExerciseTemplate,
  addSetEntry,
  assignRoutineToSession,
  addSetWithPrefill,
  createExercise,
  createRoutine,
  deleteRoutine,
  db,
  ensureCoreRoutines,
  endSession,
  getOrCreateTrackerSession,
  getActiveSession,
  getSession,
  importFullExportData,
  getSetInputPrefillFromLastSession,
  listExercises,
  listRoutines,
  getLastCompletedSessionForExercise,
  listExerciseHistory,
  markSetComplete,
  removeExerciseFromSession,
  saveSessionExerciseSet,
  listSessionSetEntries,
  copyPreviousSet,
  startSession,
  updateExercise,
  updateCompletedSetEntry,
  updateSessionExercises,
  updateRoutine,
  updateSetEntry,
  WorkoutDatabase,
} from './db'
import { applyJsonImport, buildCsvExport, buildJsonExport } from './exportImport'
import { defaultPreferences } from './preferences'

describe('IndexedDB integration', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.transaction(
      'rw',
      db.exercises,
      db.routines,
      db.sessions,
      db.setEntries,
      async () => {
        await db.setEntries.clear()
        await db.sessions.clear()
        await db.routines.clear()
        await db.exercises.clear()
      },
    )
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
    expect(history).toHaveLength(1)
    expect(history[0].session.id).toBe(firstSession.id)

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

    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(
      3,
    )
    expect(routines.filter((routine) => routine.splitId === '4-day-split')).toHaveLength(
      4,
    )

    expect(exercises.length).toBeGreaterThan(0)
    expect(routines.every((routine) => routine.exerciseIds.length > 0)).toBe(true)
  })

  it('prevents duplicate seed data when routine setup runs concurrently', async () => {
    await Promise.all([ensureCoreRoutines('lb'), ensureCoreRoutines('lb')])

    const routines = await listRoutines()

    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(
      3,
    )
    expect(routines.filter((routine) => routine.splitId === '4-day-split')).toHaveLength(
      4,
    )
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
    expect(routines.filter((routine) => routine.splitId === '3-day-split')).toHaveLength(
      3,
    )
    expect(
      routines.some(
        (routine) => routine.splitId === '3-day-split' && routine.name === 'Push',
      ),
    ).toBe(false)
    expect(
      routines.some(
        (routine) => routine.splitId === '3-day-split' && routine.name === 'Push QA',
      ),
    ).toBe(true)
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
    expect(remaining).toHaveLength(1)
    expect((await getSession(secondSession.id))?.exerciseIds).toEqual([])
  })

  it('resumes an unfinished session on another date without completing it', async () => {
    const first = await getOrCreateTrackerSession()
    const second = await getOrCreateTrackerSession()

    expect(second.id).toBe(first.id)

    await db.sessions.update(first.id, {
      startedAt: '2000-01-01T00:00:00.000Z',
    })

    const rotated = await getOrCreateTrackerSession()
    expect(rotated.id).toBe(first.id)

    const old = await getSession(first.id)
    expect(old?.endedAt).toBeUndefined()
    expect(old?.startedAt).toBe('2000-01-01T00:00:00.000Z')
  })

  it('preserves renamed seed exercises and edited routine order when setup runs again', async () => {
    await ensureCoreRoutines('lb')
    const routines = await listRoutines()
    const routine = routines.find((item) => item.name === 'Legs')!
    const exercises = await listExercises()
    const exercise = exercises.find((item) => item.name === 'Leg Press')!
    await updateExercise(exercise.id, { name: 'Single Leg Press' })
    const exerciseIds = routine.exerciseIds.filter((id) => id !== exercise.id).reverse()
    await updateRoutine(routine.id, { exerciseIds })
    await ensureCoreRoutines('lb')
    const restored = await listExercises()
    expect(restored).toHaveLength(exercises.length)
    expect(restored.some((item) => item.name === 'Leg Press')).toBe(false)
    expect(await db.exercises.get(exercise.id)).toMatchObject({
      name: 'Single Leg Press',
    })
    expect((await db.routines.get(routine.id))?.exerciseIds).toEqual(exerciseIds)
  })

  it('does not merge same-name routines or rewrite their past session associations during setup', async () => {
    const first = await createRoutine('Push', [])
    const second = await createRoutine('Push', [])
    const session = await startSession(second.id)
    await ensureCoreRoutines('lb')
    expect(await db.routines.get(first.id)).toBeDefined()
    expect(await db.routines.get(second.id)).toBeDefined()
    expect((await getSession(session.id))?.routineId).toBe(second.id)
  })

  it('creates only one tracker session when startup requests overlap', async () => {
    const sessions = await Promise.all([
      getOrCreateTrackerSession(),
      getOrCreateTrackerSession(),
    ])
    expect(sessions[0].id).toBe(sessions[1].id)
    expect(await db.sessions.count()).toBe(1)
  })

  it('keeps a session exercise plan separate from subsequent routine edits', async () => {
    const first = await createExercise({ name: 'First', unitDefault: 'lb' })
    const second = await createExercise({ name: 'Second', unitDefault: 'lb' })
    const routine = await createRoutine('Plan', [first.id])
    const session = await startSession()
    await assignRoutineToSession(session.id, routine.id)
    await updateRoutine(routine.id, { exerciseIds: [second.id] })
    await assignRoutineToSession(session.id, routine.id)
    expect((await getSession(session.id))?.exerciseIds).toEqual([first.id])
    await updateSessionExercises(session.id, [first.id, second.id])
    expect((await getSession(session.id))?.exerciseIds).toEqual([first.id, second.id])
  })

  it('includes already logged exercises when initializing a session without a saved plan', async () => {
    const planned = await createExercise({ name: 'Planned', unitDefault: 'lb' })
    const added = await createExercise({
      name: 'Added during workout',
      unitDefault: 'lb',
    })
    const routine = await createRoutine('Plan', [planned.id])
    const session = await startSession(routine.id)
    await addSetEntry(session.id, added.id, { weight: 0, reps: 8, completed: true })
    await assignRoutineToSession(session.id, routine.id)
    expect((await getSession(session.id))?.exerciseIds).toEqual([planned.id, added.id])
  })

  it('retries the same completed set once and serializes concurrent set indexes', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const input = { id: 'submission-1', weight: 135, reps: 8, completed: true }
    const retries = await Promise.all([
      addSetEntry(session.id, exercise.id, input),
      addSetEntry(session.id, exercise.id, input),
    ])
    expect(retries[0].id).toBe(retries[1].id)
    await Promise.all([
      addSetEntry(session.id, exercise.id, { weight: 135, reps: 7, completed: true }),
      addSetEntry(session.id, exercise.id, { weight: 135, reps: 6, completed: true }),
    ])
    expect((await listSessionSetEntries(session.id)).map((entry) => entry.index)).toEqual(
      [0, 1, 2],
    )
  })

  it('completes a stored unfinished set in place and makes repeated completion idempotent', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const draft = await addSetEntry(session.id, exercise.id, { weight: 100, reps: 8 })
    const completed = await addSetEntry(session.id, exercise.id, {
      id: draft.id,
      weight: 105,
      reps: 9,
      completed: true,
    })
    expect(completed).toMatchObject({
      id: draft.id,
      index: draft.index,
      weight: 105,
      reps: 9,
      unit: 'lb',
    })
    expect(completed.completedAt).toBeDefined()
    const retry = await addSetEntry(session.id, exercise.id, {
      id: draft.id,
      weight: 105,
      reps: 9,
      completed: true,
    })
    expect(retry).toEqual(completed)
    expect(await listSessionSetEntries(session.id)).toEqual([completed])
  })

  it('corrects a completed set without changing its identity, timestamp, or original unit', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const entry = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    await updateExercise(exercise.id, {
      unitDefault: 'kg',
      progressionSettings: { ...exercise.progressionSettings, unit: 'kg' },
    })
    await endSession(session.id)
    const corrected = await updateCompletedSetEntry(entry.id, { weight: 140, reps: 9 })
    expect(corrected).toMatchObject({
      id: entry.id,
      completedAt: entry.completedAt,
      unit: 'lb',
      weight: 140,
      reps: 9,
    })
    expect(await listSessionSetEntries(session.id)).toHaveLength(1)
    await expect(
      addSetEntry(session.id, exercise.id, { weight: 140, reps: 9, completed: true }),
    ).rejects.toThrow('finished')
  })

  it('skips abandoned sessions and draft-only finished sessions when choosing previous performance', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    await db.sessions.bulkAdd([
      {
        id: 'performed',
        startedAt: '2026-01-01T12:00:00.000Z',
        endedAt: '2026-01-01T13:00:00.000Z',
      },
      {
        id: 'draft',
        startedAt: '2026-01-02T12:00:00.000Z',
        endedAt: '2026-01-02T13:00:00.000Z',
      },
      { id: 'abandoned', startedAt: '2026-01-03T12:00:00.000Z' },
    ])
    await db.setEntries.bulkAdd([
      {
        id: 'work',
        sessionId: 'performed',
        exerciseId: exercise.id,
        index: 0,
        weight: 135,
        reps: 8,
        isWarmup: false,
        completedAt: '2026-01-01T12:30:00.000Z',
      },
      {
        id: 'prefilled',
        sessionId: 'draft',
        exerciseId: exercise.id,
        index: 0,
        weight: 140,
        reps: 8,
        isWarmup: false,
      },
      {
        id: 'unfinished',
        sessionId: 'abandoned',
        exerciseId: exercise.id,
        index: 0,
        weight: 145,
        reps: 8,
        isWarmup: false,
        completedAt: '2026-01-03T12:30:00.000Z',
      },
    ])
    expect((await getLastCompletedSessionForExercise(exercise.id))?.session.id).toBe(
      'performed',
    )
    expect(await getSetInputPrefillFromLastSession(exercise.id, 0)).toEqual({
      weight: 135,
      reps: 8,
    })
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

    entries = await listSessionSetEntries(session.id).then((rows) =>
      rows.filter((row) => row.exerciseId === exercise.id),
    )
    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(entries.map((entry) => [entry.weight, entry.reps])).toEqual([
      [190, 6],
      [190, 6],
      [190, 6],
    ])
    expect(entries.every((entry) => !entry.completedAt)).toBe(true)
  })

  it('shows only completed sets from finished sessions in previous exercise history', async () => {
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
    expect(history).toHaveLength(0)
    await addSetEntry(session.id, exercise.id, { weight: 170, reps: 6 })
    await endSession(session.id)
    const completedHistory = await listExerciseHistory(exercise.id, 5)
    expect(completedHistory).toHaveLength(1)
    expect(completedHistory[0].sets.map((set) => [set.weight, set.reps])).toEqual([
      [165, 6],
    ])
  })

  it('keeps completed work when applying a template and leaves copied sets incomplete', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const completed = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    await applySessionExerciseTemplate(session.id, exercise.id, [
      { weight: 140, reps: 8 },
    ])
    const entries = await listSessionSetEntries(session.id)
    expect(entries[0]).toEqual(completed)
    expect(entries[1]).toMatchObject({ weight: 140, reps: 8 })
    expect(entries[1].completedAt).toBeUndefined()
    const copy = await copyPreviousSet(session.id, exercise.id)
    expect(copy?.completedAt).toBeUndefined()
    expect(copy?.id).not.toBe(entries[1].id)
    expect(copy?.unit).toBe('lb')
  })

  it('rolls back every table if any import write fails', async () => {
    const exercise = await createExercise({ name: 'Keep me', unitDefault: 'lb' })
    const session = await startSession()
    const entry = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    await expect(
      importFullExportData({
        exercises: [exercise, exercise],
        routines: [],
        sessions: [],
        setEntries: [],
      }),
    ).rejects.toThrow()
    expect(await listExercises()).toEqual([exercise])
    expect(await listSessionSetEntries(session.id)).toEqual([entry])
    expect(await getSession(session.id)).toEqual(session)
  })

  it('rolls back the imported records when saving their associated preferences fails', async () => {
    const exercise = await createExercise({ name: 'Keep me', unitDefault: 'lb' })
    await expect(
      importFullExportData(
        { exercises: [], routines: [], sessions: [], setEntries: [] },
        () => {
          throw new Error('Storage quota exceeded')
        },
      ),
    ).rejects.toThrow('Storage quota exceeded')
    expect(await listExercises()).toEqual([exercise])
  })

  it('converts previous load to the current input unit without rewriting the recorded set', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const entry = await addSetEntry(session.id, exercise.id, {
      weight: 100,
      reps: 8,
      completed: true,
    })
    await endSession(session.id)
    await updateExercise(exercise.id, {
      progressionSettings: { ...exercise.progressionSettings, unit: 'kg' },
    })
    expect((await getSetInputPrefillFromLastSession(exercise.id, 0))?.weight).toBeCloseTo(
      45.359237,
      4,
    )
    expect((await listExerciseHistory(exercise.id))[0].sets[0]).toEqual(entry)
  })

  it('migrates existing sets to preserve their interpreted unit without changing recorded values', async () => {
    const databaseName = 'workout-unit-migration-test'
    await Dexie.delete(databaseName)
    const source = new Dexie(databaseName)
    source.version(2).stores({
      exercises: 'id,name',
      routines: 'id,name,splitId',
      sessions: 'id,startedAt,endedAt,routineId',
      setEntries: 'id,sessionId,exerciseId,[sessionId+exerciseId],index,completedAt',
    })
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'kg' })
    const original = {
      id: 'stored-set',
      sessionId: 'stored-session',
      exerciseId: exercise.id,
      index: 0,
      weight: 62.5,
      reps: 8,
      isWarmup: false,
      completedAt: '2026-01-01T12:00:00.000Z',
    }
    await source.table('exercises').add(exercise)
    await source.table('setEntries').add(original)
    source.close()
    const migrated = new WorkoutDatabase(databaseName)
    try {
      await migrated.open()
      expect(await migrated.setEntries.get(original.id)).toEqual({
        ...original,
        unit: 'kg',
      })
    } finally {
      migrated.close()
      await Dexie.delete(databaseName)
    }
  })

  it('exports per-set units and restores backups without units using their saved exercise settings', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    await addSetEntry(session.id, exercise.id, { weight: 135, reps: 8, completed: true })
    await updateExercise(exercise.id, {
      progressionSettings: { ...exercise.progressionSettings, unit: 'kg' },
    })
    expect(await buildCsvExport()).toContain('unit')
    expect(await buildCsvExport()).toContain('135,lb,8')
    const backup = JSON.parse(await buildJsonExport(defaultPreferences))
    expect(backup.data.setEntries[0].unit).toBe('lb')
    delete backup.data.setEntries[0].unit
    await applyJsonImport(JSON.stringify(backup))
    expect((await listSessionSetEntries(session.id))[0].unit).toBe('kg')
  })

  it('restores its own backup after a past workout routine has been deleted', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const routine = await createRoutine('Workout plan', [exercise.id])
    const session = await startSession(routine.id)
    const entry = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    await endSession(session.id)
    await deleteRoutine(routine.id)
    await applyJsonImport(await buildJsonExport(defaultPreferences))
    expect((await listExerciseHistory(exercise.id))[0].sets).toEqual([entry])
    expect((await getSession(session.id))?.routineId).toBe(routine.id)
  })

  it('clears only pending entry drafts when importing a backup with the same record identities', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const set = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    const key = `workout-tracker.entry.${session.id}.${exercise.id}`
    localStorage.setItem(
      key,
      JSON.stringify({ id: set.id, weight: '145', reps: '9', unit: 'lb' }),
    )
    localStorage.setItem(`${key}.unfinished`, 'pending entry')
    localStorage.setItem('workout-tracker.notes', 'keep my notes')
    await applyJsonImport(await buildJsonExport(defaultPreferences))
    expect(localStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem(`${key}.unfinished`)).toBeNull()
    expect(localStorage.getItem('workout-tracker.notes')).toBe('keep my notes')
    expect(await listSessionSetEntries(session.id)).toEqual([set])
  })

  it('restores pending entry drafts and stored records when import encounters actual storage quota failure', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const session = await startSession()
    const set = await addSetEntry(session.id, exercise.id, {
      weight: 135,
      reps: 8,
      completed: true,
    })
    const key = `workout-tracker.entry.${session.id}.${exercise.id}`
    const draft = '{"weight":"145"}'
    localStorage.setItem(key, draft)
    const fillerKey = 'unrelated-storage'
    const filler = 'x'.repeat(5_000_000 - key.length - draft.length - fillerKey.length)
    localStorage.setItem(fillerKey, filler)
    const payload = JSON.parse(await buildJsonExport(defaultPreferences))
    payload.data.setEntries[0].weight = 225
    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow('quota')
    expect(localStorage.getItem(key)).toBe(draft)
    expect(localStorage.getItem(fillerKey)).toBe(filler)
    expect(localStorage.getItem('workout-tracker.preferences.v1')).toBeNull()
    expect(localStorage.getItem('workout-tracker.core-routines-bootstrap.v1')).toBeNull()
    expect(await listSessionSetEntries(session.id)).toEqual([set])
  })

  it('rejects invalid imported units and completed reps before replacing any stored records', async () => {
    const exercise = await createExercise({ name: 'Keep me', unitDefault: 'lb' })
    const session = await startSession()
    await addSetEntry(session.id, exercise.id, { weight: 0, reps: 8, completed: true })
    const original = await buildJsonExport(defaultPreferences)
    const payload = JSON.parse(original)
    payload.data.setEntries[0].unit = 'stone'
    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow('unit')
    payload.data.setEntries[0].unit = 'lb'
    payload.data.setEntries[0].reps = 0
    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow('reps')
    expect((await listSessionSetEntries(session.id))[0].reps).toBe(8)
    expect(await listExercises()).toEqual([exercise])
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

  it('orders imported offset timestamps chronologically without changing stored dates', async () => {
    const exercise = await createExercise({ name: 'Bench', unitDefault: 'lb' })
    const payload = buildImportPayload({
      exercises: [exercise],
      sessions: [
        {
          id: 'latest-workout',
          startedAt: '2026-09-22T11:00:00+02:00',
          endedAt: '2026-09-22T14:00:00+02:00',
        },
        {
          id: 'previous-workout',
          startedAt: '2026-09-22T12:00:00+02:00',
          endedAt: '2026-09-22T13:00:00+02:00',
        },
        { id: 'earlier-active', startedAt: '2026-09-23T12:00:00+02:00' },
        { id: 'latest-active', startedAt: '2026-09-23T11:00:00Z' },
      ],
      setEntries: [
        {
          id: 'first',
          exerciseId: exercise.id,
          sessionId: 'latest-workout',
          index: 0,
          weight: 100,
          reps: 8,
          isWarmup: false,
          completedAt: '2026-09-22T12:00:00+02:00',
        },
        {
          id: 'second',
          exerciseId: exercise.id,
          sessionId: 'latest-workout',
          index: 1,
          weight: 105,
          reps: 8,
          isWarmup: false,
          completedAt: '2026-09-22T09:00:00-02:00',
        },
        {
          id: 'previous',
          exerciseId: exercise.id,
          sessionId: 'previous-workout',
          index: 0,
          weight: 110,
          reps: 8,
          isWarmup: false,
          completedAt: '2026-09-22T12:30:00+02:00',
        },
      ],
    })
    await applyJsonImport(JSON.stringify(payload))
    expect((await listExerciseHistory(exercise.id)).map((row) => row.session.id)).toEqual(
      ['latest-workout', 'previous-workout'],
    )
    expect((await getSetInputPrefillFromLastSession(exercise.id, 0))?.weight).toBe(100)
    expect((await getActiveSession())?.id).toBe('latest-active')
    expect((await getSession('latest-active'))?.startedAt).toBe('2026-09-23T11:00:00Z')
    expect((await listSessionSetEntries('latest-workout'))[1].completedAt).toBe(
      '2026-09-22T09:00:00-02:00',
    )
  })

  it('keeps exact-name exercises separate when reading history or changing definitions', async () => {
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
    expect(secondHistory).toHaveLength(0)
    expect(differentCaseHistory).toHaveLength(0)
    expect(secondPrefill).toBeNull()
    expect(
      firstHistory[0].sets.map((set) => [set.exerciseId, set.weight, set.reps]),
    ).toEqual([[first.id, 315, 10]])

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
    const unchangedDifferentCase = exercises.find(
      (exercise) => exercise.id === differentCase.id,
    )

    expect(updatedSecond).toMatchObject({
      unitDefault: 'lb',
      progressionSettings: second.progressionSettings,
    })
    expect(unchangedDifferentCase).toMatchObject({
      equipment: undefined,
      unitDefault: 'lb',
      progressionSettings: {
        ...differentCase.progressionSettings,
        unit: 'lb',
      },
    })
    await updateExercise(first.id, { name: 'Renamed Leg Extension' })
    expect((await listExerciseHistory(first.id))[0].sets[0].id).toBe(
      firstHistory[0].sets[0].id,
    )
    expect((await db.exercises.get(second.id))?.name).toBe('Leg Extension')
  })

  it('keeps an imported backup exact after routine bootstrap runs again', async () => {
    await applyJsonImport(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-04-14T00:00:00.000Z',
        preferences: {
          defaultUnit: 'kg',
          defaultWeightIncrement: 1.25,
          restTimerEnabled: false,
          restSeconds: 45,
          theme: 'light',
        },
        data: {
          exercises: [
            {
              id: 'import-exercise',
              name: 'Import Lift',
              unitDefault: 'kg',
              progressionSettings: {
                repMin: 5,
                repMax: 8,
                workSetsTarget: 4,
                weightIncrement: 1.25,
                unit: 'kg',
              },
            },
          ],
          routines: [
            {
              id: 'import-routine',
              name: 'Import Routine',
              splitId: '3-day-split',
              exerciseIds: ['import-exercise'],
            },
          ],
          sessions: [],
          setEntries: [],
        },
      }),
    )

    await ensureCoreRoutines('lb')

    const routines = await listRoutines()
    const exercises = await listExercises()

    expect(routines).toEqual([
      {
        id: 'import-routine',
        name: 'Import Routine',
        splitId: '3-day-split',
        exerciseIds: ['import-exercise'],
      },
    ])
    expect(exercises).toEqual([
      {
        id: 'import-exercise',
        name: 'Import Lift',
        unitDefault: 'kg',
        progressionSettings: {
          repMin: 5,
          repMax: 8,
          workSetsTarget: 4,
          weightIncrement: 1.25,
          unit: 'kg',
        },
      },
    ])
  })

  it('rejects imported exercises with invalid progression settings', async () => {
    const payload = buildImportPayload({
      exercises: [
        {
          id: 'bad-progression',
          name: 'Bad Progression',
          unitDefault: 'lb',
          progressionSettings: {
            repMin: 10,
            repMax: 6,
            workSetsTarget: 3,
            weightIncrement: 5,
            unit: 'lb',
          },
        },
      ],
    })

    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow(
      'Import failed: data.exercises[0].progressionSettings.repMax must be greater than or equal to repMin.',
    )
    await expect(listExercises()).resolves.toEqual([])
  })

  it('rejects imported routines that reference missing exercises', async () => {
    const payload = buildImportPayload({
      routines: [
        {
          id: 'missing-exercise-routine',
          name: 'Missing Exercise Routine',
          splitId: '3-day-split',
          exerciseIds: ['missing-exercise'],
        },
      ],
    })

    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow(
      'Import failed: data.routines[0].exerciseIds[0] references an unknown exercise.',
    )
    await expect(listRoutines()).resolves.toEqual([])
  })

  it('rejects imported set entries that reference missing parent records', async () => {
    const payload = buildImportPayload({
      exercises: [
        {
          id: 'known-exercise',
          name: 'Known Exercise',
          unitDefault: 'lb',
          progressionSettings: {
            repMin: 6,
            repMax: 10,
            workSetsTarget: 3,
            weightIncrement: 5,
            unit: 'lb',
          },
        },
      ],
      setEntries: [
        {
          id: 'orphan-set',
          sessionId: 'missing-session',
          exerciseId: 'known-exercise',
          index: 0,
          weight: 135,
          reps: 8,
          isWarmup: false,
          completedAt: '2026-05-12T12:00:00.000Z',
        },
      ],
    })

    await expect(applyJsonImport(JSON.stringify(payload))).rejects.toThrow(
      'Import failed: data.setEntries[0].sessionId references an unknown session.',
    )
    await expect(listSessionSetEntries('missing-session')).resolves.toEqual([])
  })
})

function buildImportPayload(
  data: Partial<{
    exercises: unknown[]
    routines: unknown[]
    sessions: unknown[]
    setEntries: unknown[]
  }>,
) {
  return {
    version: 1,
    exportedAt: '2026-05-12T00:00:00.000Z',
    preferences: {
      defaultUnit: 'lb',
      defaultWeightIncrement: 5,
      restTimerEnabled: true,
      restSeconds: 90,
      theme: 'dark',
    },
    data: {
      exercises: data.exercises ?? [],
      routines: data.routines ?? [],
      sessions: data.sessions ?? [],
      setEntries: data.setEntries ?? [],
    },
  }
}
