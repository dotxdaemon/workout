import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  addSetEntry,
  createExercise,
  ensureCoreRoutines,
  getOrCreateTrackerSession,
  getSetInputPrefillFromLastSession,
  listExercises,
  listRoutines,
  listSessionSetEntries,
  updateRoutine,
} from '../lib/db'
import { formatNumber } from '../lib/format'
import { readPreferences } from '../lib/preferences'
import { readSelectedRoutineId, writeSelectedRoutineId } from '../lib/routineSelection'
import type { Exercise, Routine, SetEntry, Unit } from '../types'

interface ExerciseDraft {
  weight: string
  reps: string
}

const routineDayOrder = ['pull', 'push', 'legs']

export function RoutinesScreen() {
  const weightInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [draftsByExercise, setDraftsByExercise] = useState<Record<string, ExerciseDraft>>({})
  const [addExerciseQuery, setAddExerciseQuery] = useState('')
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  const dayRoutines = useMemo(() => {
    const routineByName = new Map(
      routines.map((routine) => [routine.name.toLowerCase(), routine]),
    )

    const ordered = routineDayOrder
      .map((name) => routineByName.get(name))
      .filter((routine): routine is Routine => Boolean(routine))

    const extra = routines.filter(
      (routine) => !routineDayOrder.includes(routine.name.toLowerCase()),
    )

    return [...ordered, ...extra]
  }, [routines])

  const selectedRoutine = useMemo(
    () => dayRoutines.find((routine) => routine.id === selectedRoutineId) ?? dayRoutines[0],
    [dayRoutines, selectedRoutineId],
  )

  const selectedExerciseIds = useMemo(
    () => selectedRoutine?.exerciseIds ?? [],
    [selectedRoutine],
  )
  const selectedExerciseIdSet = useMemo(
    () => new Set(selectedExerciseIds),
    [selectedExerciseIds],
  )

  const addQuery = addExerciseQuery.trim()
  const addQueryLower = addQuery.toLowerCase()

  const addOptions = useMemo(() => {
    if (!addQuery) {
      return []
    }

    const exactMatch = exercises.find(
      (exercise) => exercise.name.toLowerCase() === addQueryLower,
    )
    const filtered = exercises
      .filter((exercise) => {
        if (selectedExerciseIdSet.has(exercise.id)) {
          return false
        }

        return exercise.name.toLowerCase().includes(addQueryLower)
      })
      .slice(0, 6)

    const options: Array<
      | { kind: 'create'; label: string }
      | { kind: 'existing'; exercise: Exercise; label: string }
    > = []

    if (!exactMatch) {
      options.push({
        kind: 'create',
        label: `Create "${addQuery}" and add`,
      })
    }

    for (const exercise of filtered) {
      options.push({
        kind: 'existing',
        exercise,
        label: exercise.name,
      })
    }

    return options
  }, [addQuery, addQueryLower, exercises, selectedExerciseIdSet])

  const loadData = useCallback(async () => {
    const preferences = readPreferences()
    await ensureCoreRoutines(preferences.defaultUnit)

    const trackerSession = await getOrCreateTrackerSession()

    const [loadedRoutines, loadedExercises, sessionSets] = await Promise.all([
      listRoutines(),
      listExercises(),
      listSessionSetEntries(trackerSession.id),
    ])

    setTrackerSessionId(trackerSession.id)
    setRoutines(loadedRoutines)
    setExercises(loadedExercises)
    setSetsByExercise(groupSetsByExercise(sessionSets))
    setDefaultUnit(preferences.defaultUnit)
    setError('')

    const storedRoutineId = readSelectedRoutineId()

    setSelectedRoutineId((current) => {
      if (current && loadedRoutines.some((routine) => routine.id === current)) {
        return current
      }

      if (
        storedRoutineId &&
        loadedRoutines.some((routine) => routine.id === storedRoutineId)
      ) {
        return storedRoutineId
      }

      const byName = new Map(
        loadedRoutines.map((routine) => [routine.name.toLowerCase(), routine.id]),
      )

      return (
        byName.get('push') ??
        byName.get('pull') ??
        byName.get('legs') ??
        loadedRoutines[0]?.id ??
        ''
      )
    })
  }, [])

  useEffect(() => {
    void loadData().catch(() => {
      setError('Could not load routines.')
    })
  }, [loadData])

  useEffect(() => {
    if (!selectedRoutineId) {
      return
    }

    writeSelectedRoutineId(selectedRoutineId)
  }, [selectedRoutineId])

  const prefillRoutineDrafts = useCallback(
    async (exerciseIds: string[]): Promise<void> => {
      for (const exerciseId of exerciseIds) {
        const sessionSets = setsByExercise[exerciseId] ?? []
        const latestSet = sessionSets.at(-1)

        setDraftsByExercise((current) => {
          const existing = current[exerciseId]
          if (existing && (existing.weight.length > 0 || existing.reps.length > 0)) {
            return current
          }

          if (!latestSet) {
            return current
          }

          return {
            ...current,
            [exerciseId]: {
              weight: formatNumber(latestSet.weight),
              reps: latestSet.reps > 0 ? String(latestSet.reps) : '',
            },
          }
        })

        if (latestSet) {
          continue
        }

        const prefill = await getSetInputPrefillFromLastSession(exerciseId, 0)
        if (!prefill) {
          continue
        }

        setDraftsByExercise((current) => {
          const existing = current[exerciseId]
          if (existing && (existing.weight.length > 0 || existing.reps.length > 0)) {
            return current
          }

          return {
            ...current,
            [exerciseId]: {
              weight: formatNumber(prefill.weight),
              reps: prefill.reps > 0 ? String(prefill.reps) : '',
            },
          }
        })
      }
    },
    [setsByExercise],
  )

  useEffect(() => {
    if (!selectedRoutine) {
      return
    }

    void prefillRoutineDrafts(selectedRoutine.exerciseIds)
  }, [prefillRoutineDrafts, selectedRoutine])

  async function saveRoutineExerciseIds(
    routine: Routine,
    nextExerciseIds: string[],
  ): Promise<void> {
    await updateRoutine(routine.id, {
      exerciseIds: nextExerciseIds,
    })

    setRoutines((current) =>
      current.map((item) =>
        item.id === routine.id ? { ...item, exerciseIds: nextExerciseIds } : item,
      ),
    )
  }

  async function handleAddExerciseFromQuery(existingExercise?: Exercise): Promise<void> {
    if (!selectedRoutine) {
      return
    }

    let exerciseToAdd = existingExercise

    if (!exerciseToAdd && addQuery) {
      const exact = exercises.find((exercise) => exercise.name.toLowerCase() === addQueryLower)
      const firstMatch = exercises.find(
        (exercise) =>
          !selectedExerciseIdSet.has(exercise.id) &&
          exercise.name.toLowerCase().includes(addQueryLower),
      )
      exerciseToAdd = exact ?? firstMatch
    }

    if (!exerciseToAdd && addQuery) {
      exerciseToAdd = await createExercise({
        name: addQuery,
        unitDefault: defaultUnit,
      })
      setExercises((current) => [...current, exerciseToAdd as Exercise])
    }

    if (!exerciseToAdd) {
      return
    }

    if (selectedExerciseIdSet.has(exerciseToAdd.id)) {
      setAddExerciseQuery('')
      return
    }

    const nextExerciseIds = [...selectedRoutine.exerciseIds, exerciseToAdd.id]
    await saveRoutineExerciseIds(selectedRoutine, nextExerciseIds)

    setAddExerciseQuery('')
    setMessage(`${exerciseToAdd.name} added to ${selectedRoutine.name}.`)

    await prefillRoutineDrafts([exerciseToAdd.id])
    requestAnimationFrame(() => {
      weightInputRefs.current[exerciseToAdd.id]?.focus()
    })
  }

  async function handleLogSet(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    const draft = draftsByExercise[exerciseId] ?? { weight: '', reps: '' }
    const weight = Number(draft.weight)
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Weight is required.')
      weightInputRefs.current[exerciseId]?.focus()
      return
    }

    const repsValue = draft.reps.trim().length === 0 ? 0 : Number(draft.reps)
    if (!Number.isFinite(repsValue) || repsValue < 0) {
      setError('Reps must be a number or blank.')
      return
    }

    const entry = await addSetEntry(trackerSessionId, exerciseId, {
      weight,
      reps: repsValue,
      completed: true,
    })

    setSetsByExercise((current) => ({
      ...current,
      [exerciseId]: [...(current[exerciseId] ?? []), entry],
    }))

    setDraftsByExercise((current) => ({
      ...current,
      [exerciseId]: {
        weight: formatNumber(weight),
        reps: repsValue > 0 ? String(repsValue) : '',
      },
    }))

    setError('')
    requestAnimationFrame(() => {
      weightInputRefs.current[exerciseId]?.focus()
    })
  }

  function handleDraftChange(
    exerciseId: string,
    field: keyof ExerciseDraft,
    value: string,
  ): void {
    setDraftsByExercise((current) => ({
      ...current,
      [exerciseId]: {
        weight: current[exerciseId]?.weight ?? '',
        reps: current[exerciseId]?.reps ?? '',
        [field]: value,
      },
    }))
  }

  function handleDraftKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    exerciseId: string,
  ): void {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    void handleLogSet(exerciseId)
  }

  async function handleRemoveExercise(exerciseId: string): Promise<void> {
    if (!selectedRoutine) {
      return
    }

    const nextExerciseIds = selectedRoutine.exerciseIds.filter((id) => id !== exerciseId)
    await saveRoutineExerciseIds(selectedRoutine, nextExerciseIds)
  }

  async function handleMoveExercise(
    exerciseId: string,
    direction: -1 | 1,
  ): Promise<void> {
    if (!selectedRoutine) {
      return
    }

    const index = selectedRoutine.exerciseIds.indexOf(exerciseId)
    if (index < 0) {
      return
    }

    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= selectedRoutine.exerciseIds.length) {
      return
    }

    const nextExerciseIds = [...selectedRoutine.exerciseIds]
    ;[nextExerciseIds[index], nextExerciseIds[nextIndex]] = [
      nextExerciseIds[nextIndex],
      nextExerciseIds[index],
    ]

    await saveRoutineExerciseIds(selectedRoutine, nextExerciseIds)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Routines</h1>
        <p>Tap Push, Pull, or Legs to log what you hit.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel panel--compact">
        <div className="day-picker">
          {dayRoutines.map((routine) => {
            const isActive = selectedRoutine?.id === routine.id
            return (
              <button
                key={routine.id}
                type="button"
                className={isActive ? 'day-button day-button--active' : 'day-button'}
                onClick={() => setSelectedRoutineId(routine.id)}
              >
                <span>{routine.name}</span>
                <small>{routine.exerciseIds.length} exercises</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel panel--compact">
        <h2>{selectedRoutine?.name ?? 'Routine'}</h2>

        <div className="add-row">
          <input
            value={addExerciseQuery}
            onChange={(event) => setAddExerciseQuery(event.target.value)}
            placeholder="Add exercise to this day..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleAddExerciseFromQuery()
              }
            }}
          />
          <button
            type="button"
            className="button button--small"
            onClick={() => void handleAddExerciseFromQuery()}
          >
            Add
          </button>
        </div>

        {addOptions.length > 0 ? (
          <div className="suggestions-list">
            {addOptions.map((option) =>
              option.kind === 'create' ? (
                <button
                  key={`create-${addQueryLower}`}
                  type="button"
                  className="suggestion-button"
                  onClick={() => void handleAddExerciseFromQuery()}
                >
                  {option.label}
                </button>
              ) : (
                <button
                  key={option.exercise.id}
                  type="button"
                  className="suggestion-button"
                  onClick={() => void handleAddExerciseFromQuery(option.exercise)}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
        ) : null}

        <div className="routine-exercise-list">
          {selectedExerciseIds.map((exerciseId) => {
            const exercise = exerciseMap[exerciseId]
            if (!exercise) {
              return null
            }

            const sets = setsByExercise[exerciseId] ?? []
            const latestSet = sets.at(-1)
            const draft = draftsByExercise[exerciseId] ?? { weight: '', reps: '' }

            return (
              <article key={exercise.id} className="list-card routine-exercise-row">
                <div className="row row--between row--center">
                  <div>
                    <div className="row row--center">
                      <h3>{exercise.name}</h3>
                      <span className="tiny-unit">{exercise.progressionSettings.unit}</span>
                    </div>
                    <p className="muted">
                      Last hit:{' '}
                      {latestSet
                        ? `${formatNumber(latestSet.weight)} x ${latestSet.reps}`
                        : '-'}
                    </p>
                  </div>

                  <div className="exercise-card__actions">
                    <Link className="icon-link" to={`/exercise/${exercise.id}`}>
                      History
                    </Link>
                    <button
                      type="button"
                      className="icon-link"
                      onClick={() => void handleMoveExercise(exercise.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-link"
                      onClick={() => void handleMoveExercise(exercise.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-link icon-link--danger"
                      onClick={() => void handleRemoveExercise(exercise.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="routine-log-row">
                  <input
                    ref={(node) => {
                      weightInputRefs.current[exercise.id] = node
                    }}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="Wt"
                    value={draft.weight}
                    onChange={(event) =>
                      handleDraftChange(exercise.id, 'weight', event.target.value)
                    }
                    onKeyDown={(event) => handleDraftKeyDown(event, exercise.id)}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    placeholder="Reps"
                    value={draft.reps}
                    onChange={(event) =>
                      handleDraftChange(exercise.id, 'reps', event.target.value)
                    }
                    onKeyDown={(event) => handleDraftKeyDown(event, exercise.id)}
                  />
                  <button
                    type="button"
                    className="button button--small button--primary"
                    onClick={() => void handleLogSet(exercise.id)}
                  >
                    Save
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function groupSetsByExercise(entries: SetEntry[]): Record<string, SetEntry[]> {
  const grouped: Record<string, SetEntry[]> = {}

  for (const entry of entries) {
    if (!grouped[entry.exerciseId]) {
      grouped[entry.exerciseId] = []
    }
    grouped[entry.exerciseId].push(entry)
  }

  for (const exerciseId of Object.keys(grouped)) {
    grouped[exerciseId].sort((left, right) => left.index - right.index)
  }

  return grouped
}
