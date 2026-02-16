import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createExercise,
  createRoutine,
  deleteRoutine,
  getActiveSession,
  listExercises,
  listRoutines,
  startSession,
  updateRoutine,
} from '../lib/db'
import { readPreferences } from '../lib/preferences'
import type { Exercise, Routine, Unit } from '../types'

interface RoutineEditorState {
  id?: string
  name: string
  exerciseIds: string[]
}

const initialEditorState: RoutineEditorState = {
  name: '',
  exerciseIds: [],
}

export function RoutinesScreen() {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [editor, setEditor] = useState<RoutineEditorState>(initialEditorState)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseUnit, setNewExerciseUnit] = useState<Unit>('lb')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  const loadData = useCallback(async () => {
    const [loadedRoutines, loadedExercises] = await Promise.all([
      listRoutines(),
      listExercises(),
    ])

    setRoutines(loadedRoutines)
    setExercises(loadedExercises)

    const preferences = readPreferences()
    setNewExerciseUnit(preferences.defaultUnit)
  }, [])

  useEffect(() => {
    void loadData().catch(() => {
      setError('Could not load routines.')
    })
  }, [loadData])

  function resetEditor(): void {
    setEditor(initialEditorState)
  }

  function handleEditRoutine(routine: Routine): void {
    setEditor({
      id: routine.id,
      name: routine.name,
      exerciseIds: [...routine.exerciseIds],
    })
  }

  function appendExerciseToEditor(exerciseId: string): void {
    setEditor((current) => {
      if (current.exerciseIds.includes(exerciseId)) {
        return current
      }

      return {
        ...current,
        exerciseIds: [...current.exerciseIds, exerciseId],
      }
    })
  }

  function removeEditorExercise(index: number): void {
    setEditor((current) => ({
      ...current,
      exerciseIds: current.exerciseIds.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
  }

  function moveEditorExercise(index: number, direction: -1 | 1): void {
    setEditor((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.exerciseIds.length) {
        return current
      }

      const nextExerciseIds = [...current.exerciseIds]
      ;[nextExerciseIds[index], nextExerciseIds[nextIndex]] = [
        nextExerciseIds[nextIndex],
        nextExerciseIds[index],
      ]

      return {
        ...current,
        exerciseIds: nextExerciseIds,
      }
    })
  }

  async function handleCreateExercise(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const name = newExerciseName.trim()
    if (!name) {
      setError('Exercise name is required.')
      return
    }

    const exercise = await createExercise({
      name,
      unitDefault: newExerciseUnit,
    })

    setMessage(`Exercise "${exercise.name}" created.`)
    setError('')
    setNewExerciseName('')
    appendExerciseToEditor(exercise.id)
    await loadData()
  }

  async function handleSaveRoutine(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const name = editor.name.trim()
    if (!name) {
      setError('Routine name is required.')
      return
    }

    if (editor.exerciseIds.length === 0) {
      setError('Add at least one exercise to the routine.')
      return
    }

    if (editor.id) {
      await updateRoutine(editor.id, {
        name,
        exerciseIds: editor.exerciseIds,
      })
      setMessage('Routine updated.')
    } else {
      await createRoutine(name, editor.exerciseIds)
      setMessage('Routine created.')
    }

    setError('')
    resetEditor()
    await loadData()
  }

  async function handleDeleteRoutine(routineId: string): Promise<void> {
    if (!window.confirm('Delete this routine?')) {
      return
    }

    await deleteRoutine(routineId)
    if (editor.id === routineId) {
      resetEditor()
    }

    setMessage('Routine deleted.')
    setError('')
    await loadData()
  }

  async function handleStartRoutine(routineId: string): Promise<void> {
    const activeSession = await getActiveSession()
    if (activeSession) {
      navigate(`/session/${activeSession.id}`)
      return
    }

    const session = await startSession(routineId)
    navigate(`/session/${session.id}`)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Routines</h1>
        <p>Create routines and keep your exercise order stable.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel">
        <h2>{editor.id ? 'Edit routine' : 'Create routine'}</h2>
        <form className="stack" onSubmit={(event) => void handleSaveRoutine(event)}>
          <label className="stack stack--tight">
            <span>Routine name</span>
            <input
              value={editor.name}
              onChange={(event) =>
                setEditor((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Upper day"
            />
          </label>

          <div className="stack stack--tight">
            <span>Exercise order</span>
            {editor.exerciseIds.length === 0 ? (
              <p className="muted">Add exercises from the list below.</p>
            ) : (
              <div className="stack">
                {editor.exerciseIds.map((exerciseId, index) => (
                  <article key={`${exerciseId}-${index}`} className="list-card">
                    <h3>{exerciseMap[exerciseId]?.name ?? 'Unknown exercise'}</h3>
                    <div className="button-row">
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => moveEditorExercise(index, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => moveEditorExercise(index, 1)}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        onClick={() => removeEditorExercise(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="button-row">
            <button type="submit" className="button button--primary">
              {editor.id ? 'Save routine' : 'Create routine'}
            </button>
            {editor.id ? (
              <button type="button" className="button" onClick={resetEditor}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Exercises library</h2>

        <form className="stack" onSubmit={(event) => void handleCreateExercise(event)}>
          <label className="stack stack--tight">
            <span>Exercise name</span>
            <input
              value={newExerciseName}
              onChange={(event) => setNewExerciseName(event.target.value)}
              placeholder="Barbell bench press"
            />
          </label>

          <label className="stack stack--tight">
            <span>Default unit</span>
            <select
              value={newExerciseUnit}
              onChange={(event) => setNewExerciseUnit(event.target.value as Unit)}
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>

          <button type="submit" className="button">
            Create exercise
          </button>
        </form>

        <div className="stack">
          {exercises.map((exercise) => (
            <article key={exercise.id} className="list-card">
              <div className="row row--between">
                <h3>{exercise.name}</h3>
                <Link to={`/exercise/${exercise.id}`} className="text-link">
                  History
                </Link>
              </div>
              <p className="muted">Default unit: {exercise.unitDefault}</p>
              <button
                type="button"
                className="button"
                onClick={() => appendExerciseToEditor(exercise.id)}
              >
                Add to routine editor
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Existing routines</h2>
        {routines.length === 0 ? (
          <p>No routines created yet.</p>
        ) : (
          <div className="stack">
            {routines.map((routine) => (
              <article key={routine.id} className="list-card">
                <h3>{routine.name}</h3>
                <p className="muted">
                  {routine.exerciseIds
                    .map((exerciseId) => exerciseMap[exerciseId]?.name ?? 'Unknown')
                    .join(' • ')}
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void handleStartRoutine(routine.id)}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleEditRoutine(routine)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => void handleDeleteRoutine(routine.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
