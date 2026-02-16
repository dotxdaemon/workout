import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addSetWithPrefill,
  copyPreviousSet,
  createExercise,
  endSession,
  getSession,
  getRoutine,
  listExercises,
  listSessionSetEntries,
  markSetComplete,
  updateSetEntry,
} from '../lib/db'
import { formatDateTime, formatDuration, formatNumber } from '../lib/format'
import {
  buildProgressionSuggestion,
  isExerciseComplete,
  type ProgressionSuggestion,
} from '../lib/progression'
import { readPreferences } from '../lib/preferences'
import type { Exercise, SessionRecord, SetEntry, Unit } from '../types'

export function SessionScreen() {
  const params = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const sessionId = params.sessionId ?? ''

  const [session, setSession] = useState<SessionRecord>()
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([])
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({})
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('')
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [restTimerEnabled, setRestTimerEnabled] = useState(true)
  const [restSeconds, setRestSeconds] = useState(90)
  const [restRemaining, setRestRemaining] = useState(0)
  const [quickExerciseName, setQuickExerciseName] = useState('')
  const [quickExerciseUnit, setQuickExerciseUnit] = useState<Unit>('lb')
  const [existingExerciseToAdd, setExistingExerciseToAdd] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const currentExercise = selectedExerciseId ? exerciseMap[selectedExerciseId] : undefined
  const currentSets = useMemo(
    () => (selectedExerciseId ? (setsByExercise[selectedExerciseId] ?? []) : []),
    [selectedExerciseId, setsByExercise],
  )
  const currentSuggestion = useMemo<ProgressionSuggestion | null>(() => {
    if (!currentExercise) {
      return null
    }

    return buildProgressionSuggestion(currentExercise.progressionSettings, currentSets)
  }, [currentExercise, currentSets])

  const isCurrentExerciseComplete = useMemo(() => {
    if (!currentExercise) {
      return false
    }

    return isExerciseComplete(currentExercise.progressionSettings, currentSets)
  }, [currentExercise, currentSets])

  const loadSessionData = useCallback(async () => {
    if (!sessionId) {
      navigate('/')
      return
    }

    const loadedSession = await getSession(sessionId)
    if (!loadedSession) {
      navigate('/')
      return
    }

    const [allExercises, allEntries] = await Promise.all([
      listExercises(),
      listSessionSetEntries(sessionId),
    ])

    const routine = loadedSession.routineId
      ? await getRoutine(loadedSession.routineId)
      : undefined

    const groupedSets = groupSetsByExercise(allEntries)
    const routineExerciseIds = routine?.exerciseIds ?? []
    const entryExerciseIds = Array.from(new Set(allEntries.map((entry) => entry.exerciseId)))
    const mergedOrder = [...routineExerciseIds]

    for (const exerciseId of entryExerciseIds) {
      if (!mergedOrder.includes(exerciseId)) {
        mergedOrder.push(exerciseId)
      }
    }

    setSession(loadedSession)
    setExerciseMap(Object.fromEntries(allExercises.map((exercise) => [exercise.id, exercise])))
    setSetsByExercise(groupedSets)
    setExerciseOrder(mergedOrder)

    if (mergedOrder.length > 0) {
      setSelectedExerciseId((previous) =>
        previous && mergedOrder.includes(previous) ? previous : mergedOrder[0],
      )
      setExistingExerciseToAdd(mergedOrder[0])
    }

    const preferences = readPreferences()
    setQuickExerciseUnit(preferences.defaultUnit)
    setRestTimerEnabled(preferences.restTimerEnabled)
    setRestSeconds(preferences.restSeconds)
  }, [navigate, sessionId])

  useEffect(() => {
    void loadSessionData().catch(() => {
      setError('Unable to load session.')
    })
  }, [loadSessionData])

  useEffect(() => {
    if (restRemaining <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRestRemaining((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [restRemaining])

  async function refreshSets(exerciseId: string): Promise<void> {
    const entries = await listSessionSetEntries(sessionId)
    const grouped = groupSetsByExercise(entries)
    setSetsByExercise(grouped)

    if (!exerciseOrder.includes(exerciseId)) {
      setExerciseOrder((current) => [...current, exerciseId])
    }
  }

  async function handleAddSet(): Promise<void> {
    if (!session || !selectedExerciseId) {
      return
    }

    await addSetWithPrefill(session.id, selectedExerciseId)
    await refreshSets(selectedExerciseId)
  }

  async function handleCopyPreviousSet(): Promise<void> {
    if (!session || !selectedExerciseId) {
      return
    }

    const copied = await copyPreviousSet(session.id, selectedExerciseId)
    if (!copied) {
      setError('Add a set first before copying.')
      return
    }

    setError('')
    await refreshSets(selectedExerciseId)
  }

  async function handleUpdateSetField(
    setId: string,
    field: 'weight' | 'reps' | 'isWarmup',
    value: number | boolean,
  ): Promise<void> {
    if (!selectedExerciseId) {
      return
    }

    const patch =
      field === 'isWarmup'
        ? ({ isWarmup: value as boolean } satisfies Partial<SetEntry>)
        : ({ [field]: Number(value) } satisfies Partial<SetEntry>)

    setSetsByExercise((current) => ({
      ...current,
      [selectedExerciseId]: (current[selectedExerciseId] ?? []).map((entry) =>
        entry.id === setId ? { ...entry, ...patch } : entry,
      ),
    }))

    await updateSetEntry(setId, patch)
  }

  async function handleToggleComplete(setEntry: SetEntry): Promise<void> {
    if (!selectedExerciseId) {
      return
    }

    const willComplete = !setEntry.completedAt
    await markSetComplete(setEntry.id, willComplete)

    if (willComplete && restTimerEnabled && restSeconds > 0) {
      setRestRemaining(restSeconds)
    }

    await refreshSets(selectedExerciseId)
  }

  async function handleAddExistingExercise(): Promise<void> {
    if (!existingExerciseToAdd) {
      return
    }

    setExerciseOrder((current) => {
      if (current.includes(existingExerciseToAdd)) {
        return current
      }
      return [...current, existingExerciseToAdd]
    })
    setSelectedExerciseId(existingExerciseToAdd)
  }

  async function handleCreateExercise(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const name = quickExerciseName.trim()
    if (!name) {
      setError('Exercise name is required.')
      return
    }

    const exercise = await createExercise({
      name,
      unitDefault: quickExerciseUnit,
    })

    setExerciseMap((current) => ({
      ...current,
      [exercise.id]: exercise,
    }))
    setExerciseOrder((current) => [...current, exercise.id])
    setSelectedExerciseId(exercise.id)
    setQuickExerciseName('')
    setError('')
    setMessage(`Exercise "${exercise.name}" added.`)
  }

  async function handleEndSession(): Promise<void> {
    if (!session) {
      return
    }

    await endSession(session.id)
    navigate('/')
  }

  function handleNumericChange(
    event: ChangeEvent<HTMLInputElement>,
    setId: string,
    field: 'weight' | 'reps',
  ): void {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) {
      return
    }

    void handleUpdateSetField(setId, field, value)
  }

  const availableExercises = Object.values(exerciseMap).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <section className="page">
      <header className="page-header">
        <h1>Session</h1>
        <p>
          Started {formatDateTime(session?.startedAt)}
          {session?.routineId ? ' · From routine' : ''}
        </p>
        <p className="muted">Weight first logging: enter weight, reps optional.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {restTimerEnabled && restRemaining > 0 ? (
        <div className="rest-timer" role="status" aria-live="polite">
          Rest: {formatDuration(restRemaining)}
        </div>
      ) : null}

      <div className="panel">
        <div className="row row--between">
          <h2>Exercise</h2>
          {currentExercise ? (
            <Link className="text-link" to={`/exercise/${currentExercise.id}`}>
              History
            </Link>
          ) : null}
        </div>

        {exerciseOrder.length === 0 ? (
          <p>Add an exercise to begin logging.</p>
        ) : (
          <div className="exercise-tabs" role="tablist" aria-label="Session exercises">
            {exerciseOrder.map((exerciseId) => {
              const exercise = exerciseMap[exerciseId]
              if (!exercise) {
                return null
              }

              const isActive = selectedExerciseId === exerciseId
              return (
                <button
                  key={exercise.id}
                  type="button"
                  className={isActive ? 'chip chip--active' : 'chip'}
                  onClick={() => setSelectedExerciseId(exerciseId)}
                  role="tab"
                  aria-selected={isActive}
                >
                  {exercise.name}
                </button>
              )
            })}
          </div>
        )}
        {currentExercise ? (
          <>
            <p className="muted">Now logging: {currentExercise.name}</p>
            <p className="muted">Unit: {currentExercise.progressionSettings.unit}</p>
          </>
        ) : null}

        {currentExercise ? (
          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void handleAddSet()}
            >
              Add weight entry
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void handleCopyPreviousSet()}
            >
              Copy last entry
            </button>
          </div>
        ) : null}

        {currentExercise ? (
          <>
            <div className="stack">
              {currentSets.length === 0 ? (
                <p>No entries yet. Tap "Add weight entry" to start.</p>
              ) : (
                currentSets.map((setEntry, index) => (
                  <article key={setEntry.id} className="set-row">
                    <div className="row row--between row--center">
                      <h3>Set {index + 1}</h3>
                      <button
                        type="button"
                        className={
                          setEntry.completedAt
                            ? 'button button--small button--success'
                            : 'button button--small'
                        }
                        onClick={() => void handleToggleComplete(setEntry)}
                      >
                        {setEntry.completedAt ? 'Completed' : 'Mark complete'}
                      </button>
                    </div>

                    <div className="input-grid">
                      <label className="stack stack--tight">
                        <span>Weight</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={setEntry.weight}
                          onChange={(event) =>
                            handleNumericChange(event, setEntry.id, 'weight')
                          }
                        />
                      </label>

                      <label className="stack stack--tight">
                        <span>Reps (optional)</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={setEntry.reps}
                          onChange={(event) =>
                            handleNumericChange(event, setEntry.id, 'reps')
                          }
                        />
                      </label>
                    </div>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={setEntry.isWarmup}
                        onChange={(event) =>
                          void handleUpdateSetField(
                            setEntry.id,
                            'isWarmup',
                            event.target.checked,
                          )
                        }
                      />
                      Warm-up set
                    </label>
                  </article>
                ))
              )}
            </div>

            {isCurrentExerciseComplete && currentSuggestion ? (
              <div className="suggestion-card" aria-live="polite">
                <h3>Progression suggestion</h3>
                <p>{currentSuggestion.message}</p>
                <p className="muted">
                  Suggested reps:{' '}
                  {currentSuggestion.nextReps.map((rep) => formatNumber(rep)).join(', ')}
                </p>
                <p className="muted">You can ignore this anytime.</p>
              </div>
            ) : null}
          </>
        ) : null}

        <details className="details-panel">
          <summary>More options</summary>
          <div className="stack">
            <label className="stack stack--tight">
              <span>Add existing exercise</span>
              <select
                value={existingExerciseToAdd}
                onChange={(event) => setExistingExerciseToAdd(event.target.value)}
              >
                <option value="">Select exercise</option>
                {availableExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button"
                onClick={() => void handleAddExistingExercise()}
              >
                Add to this session
              </button>
            </label>

            <form className="stack" onSubmit={(event) => void handleCreateExercise(event)}>
              <label className="stack stack--tight">
                <span>Create exercise</span>
                <input
                  value={quickExerciseName}
                  onChange={(event) => setQuickExerciseName(event.target.value)}
                  placeholder="Romanian deadlift"
                />
              </label>

              <label className="stack stack--tight">
                <span>Unit</span>
                <select
                  value={quickExerciseUnit}
                  onChange={(event) => setQuickExerciseUnit(event.target.value as Unit)}
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>

              <button type="submit" className="button">
                Create and add
              </button>
            </form>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={restTimerEnabled}
                onChange={(event) => setRestTimerEnabled(event.target.checked)}
              />
              Enable rest timer
            </label>

            <label className="stack stack--tight">
              <span>Rest timer seconds</span>
              <input
                type="number"
                min="0"
                value={restSeconds}
                onChange={(event) =>
                  setRestSeconds(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </label>
          </div>
        </details>

        <button
          type="button"
          className="button button--danger"
          onClick={() => void handleEndSession()}
        >
          End session
        </button>
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
    grouped[exerciseId].sort((a, b) => a.index - b.index)
  }

  return grouped
}
