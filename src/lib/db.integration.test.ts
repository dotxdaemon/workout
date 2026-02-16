import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSetWithPrefill,
  createExercise,
  db,
  endSession,
  getLastCompletedSessionForExercise,
  listExerciseHistory,
  markSetComplete,
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
})
