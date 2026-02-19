// ABOUTME: Renders the routines tab with fast daily logging and separate routine editing mode.
// ABOUTME: Records saved sets and history while keeping admin controls out of the today flow.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  addSetEntry,
  applySessionExerciseTemplate,
  assignRoutineToSession,
  createExercise,
  createRoutine,
  deleteRoutine,
  ensureCoreRoutines,
  getOrCreateTrackerSession,
  listExerciseHistory,
  listExercises,
  listRoutines,
  listSessionExerciseEntries,
  listSessionSetEntries,
  updateExercise,
  updateRoutine,
} from '../lib/db'
import { formatDateTime, formatNumber } from '../lib/format'
import { readPreferences } from '../lib/preferences'
import { buildProgressionSuggestion } from '../lib/progression'
import { readSelectedRoutineId, writeSelectedRoutineId } from '../lib/routineSelection'
import type { Exercise, Routine, SessionRecord, SetEntry, Unit } from '../types'

interface SetDraft {
  weight: string
  reps: string
}

interface HistoryItem {
  session: SessionRecord
  sets: SetEntry[]
}

interface HistorySheetState {
  exerciseId: string
  exerciseName: string
  rows: HistoryItem[]
}

interface RoutineExerciseDraft {
  id: string
  name: string
  unit: Unit
  repMin: string
  repMax: string
  workSetsTarget: string
  weightIncrement: string
}

type ScreenMode = 'today' | 'edit'

const routineDayOrder = ['pull', 'push', 'legs']

export function RoutinesScreen() {
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [historyByExercise, setHistoryByExercise] = useState<Record<string, HistoryItem[]>>({})
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [mode, setMode] = useState<ScreenMode>('today')
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [draftsByExercise, setDraftsByExercise] = useState<Record<string, SetDraft[]>>({})
  const [notesByExercise, setNotesByExercise] = useState<Record<string, string>>({})
  const [historySheet, setHistorySheet] = useState<HistorySheetState | null>(null)
  const [savedVisible, setSavedVisible] = useState(false)
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState(5)
  const [routineNameDraft, setRoutineNameDraft] = useState('')
  const [exerciseDrafts, setExerciseDrafts] = useState<RoutineExerciseDraft[]>([])
  const [addExerciseName, setAddExerciseName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  const orderedRoutines = useMemo(() => {
    const routineByName = new Map(routines.map((routine) => [routine.name.toLowerCase(), routine]))

    const ordered = routineDayOrder
      .map((name) => routineByName.get(name))
      .filter((routine): routine is Routine => Boolean(routine))

    const extras = routines.filter((routine) => !routineDayOrder.includes(routine.name.toLowerCase()))
    return [...ordered, ...extras]
  }, [routines])

  const selectedRoutine = useMemo(
    () => orderedRoutines.find((routine) => routine.id === selectedRoutineId) ?? orderedRoutines[0],
    [orderedRoutines, selectedRoutineId],
  )

  const selectedExerciseIds = useMemo(
    () => selectedRoutine?.exerciseIds ?? [],
    [selectedRoutine],
  )

  const loadData = useCallback(async () => {
    const preferences = readPreferences()
    await ensureCoreRoutines(preferences.defaultUnit)

    const trackerSession = await getOrCreateTrackerSession()
    const [loadedRoutines, loadedExercises, sessionSets] = await Promise.all([
      listRoutines(),
      listExercises(),
      listSessionSetEntries(trackerSession.id),
    ])

    const groupedSets = groupSetsByExercise(sessionSets)

    setTrackerSessionId(trackerSession.id)
    setRoutines(loadedRoutines)
    setExercises(loadedExercises)
    setSetsByExercise(groupedSets)
    setDefaultUnit(preferences.defaultUnit)
    setDefaultWeightIncrement(preferences.defaultWeightIncrement)
    setError('')

    const storedRoutineId = readSelectedRoutineId()

    setSelectedRoutineId((current) => {
      if (current && loadedRoutines.some((routine) => routine.id === current)) {
        return current
      }

      if (storedRoutineId && loadedRoutines.some((routine) => routine.id === storedRoutineId)) {
        return storedRoutineId
      }

      const byName = new Map(loadedRoutines.map((routine) => [routine.name.toLowerCase(), routine.id]))

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
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedRoutineId) {
      return
    }

    writeSelectedRoutineId(selectedRoutineId)
  }, [selectedRoutineId])

  useEffect(() => {
    if (!trackerSessionId || !selectedRoutineId) {
      return
    }

    void assignRoutineToSession(trackerSessionId, selectedRoutineId).catch(() => {
      setError('Could not associate routine with the current session.')
    })
  }, [selectedRoutineId, trackerSessionId])

  useEffect(() => {
    if (selectedExerciseIds.length === 0) {
      setHistoryByExercise({})
      return
    }

    let isCurrent = true

    void Promise.all(
      selectedExerciseIds.map(async (exerciseId) => {
        const rows = await listExerciseHistory(exerciseId, 5)
        return [exerciseId, rows] as const
      }),
    )
      .then((pairs) => {
        if (!isCurrent) {
          return
        }

        setHistoryByExercise(Object.fromEntries(pairs))
      })
      .catch(() => {
        if (isCurrent) {
          setError('Could not load exercise history.')
        }
      })

    return () => {
      isCurrent = false
    }
  }, [selectedExerciseIds])

  useEffect(() => {
    if (!selectedRoutine) {
      setDraftsByExercise({})
      return
    }

    setDraftsByExercise((current) => {
      const next: Record<string, SetDraft[]> = {}

      for (const exerciseId of selectedRoutine.exerciseIds) {
        const exercise = exerciseMap[exerciseId]
        if (!exercise) {
          continue
        }

        const setEntries = setsByExercise[exerciseId] ?? []
        next[exerciseId] = buildSetDraftsFromEntries(
          setEntries,
          exercise.progressionSettings.workSetsTarget,
          current[exerciseId],
        )
      }

      return next
    })
  }, [exerciseMap, selectedRoutine, setsByExercise])

  useEffect(() => {
    if (!trackerSessionId || !selectedRoutine) {
      setNotesByExercise({})
      return
    }

    const next: Record<string, string> = {}

    for (const exerciseId of selectedRoutine.exerciseIds) {
      const key = noteStorageKey(trackerSessionId, exerciseId)
      next[exerciseId] = localStorage.getItem(key) ?? ''
    }

    setNotesByExercise(next)
  }, [selectedRoutine, trackerSessionId])

  useEffect(() => {
    if (mode !== 'edit' || !selectedRoutine) {
      return
    }

    setRoutineNameDraft(selectedRoutine.name)
    setExerciseDrafts(
      selectedRoutine.exerciseIds
        .map((exerciseId) => exerciseMap[exerciseId])
        .filter((exercise): exercise is Exercise => Boolean(exercise))
        .map(toRoutineExerciseDraft),
    )
    setAddExerciseName('')
  }, [exerciseMap, mode, selectedRoutine])

  function showSavedFeedback(): void {
    setSavedVisible(true)

    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current)
    }

    savedTimerRef.current = setTimeout(() => {
      setSavedVisible(false)
      savedTimerRef.current = null
    }, 900)
  }

  async function refreshHistoryForExercise(exerciseId: string): Promise<void> {
    const rows = await listExerciseHistory(exerciseId, 5)
    setHistoryByExercise((current) => ({
      ...current,
      [exerciseId]: rows,
    }))
  }

  function updateDraftSet(
    exerciseId: string,
    setIndex: number,
    updater: (draft: SetDraft) => SetDraft,
  ): void {
    setDraftsByExercise((current) => {
      const exercise = exerciseMap[exerciseId]
      const targetSets = exercise?.progressionSettings.workSetsTarget ?? setIndex + 1
      const base = ensureSetDraftLength(current[exerciseId] ?? [], targetSets)
      const nextSet = updater(base[setIndex])

      base[setIndex] = nextSet

      return {
        ...current,
        [exerciseId]: base,
      }
    })
  }

  function handleSetDraftChange(
    exerciseId: string,
    setIndex: number,
    field: keyof SetDraft,
    value: string,
  ): void {
    updateDraftSet(exerciseId, setIndex, (draft) => ({
      ...draft,
      [field]: value,
    }))
  }

  function handleSetStepAdjust(
    exerciseId: string,
    setIndex: number,
    field: keyof SetDraft,
    step: number,
    direction: -1 | 1,
  ): void {
    updateDraftSet(exerciseId, setIndex, (draft) => {
      const currentValue = field === 'weight' ? parseWeight(draft.weight) : parseReps(draft.reps)
      const nextValue = Math.max(0, currentValue + step * direction)

      if (field === 'weight') {
        return {
          ...draft,
          weight: nextValue <= 0 ? '' : formatNumber(nextValue),
        }
      }

      return {
        ...draft,
        reps: nextValue <= 0 ? '' : String(Math.round(nextValue)),
      }
    })
  }

  function handleCardClick(exerciseId: string): void {
    setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId))
  }

  function stopCardToggle(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation()
  }

  async function handleUseTemplate(exerciseId: string, sets: SetEntry[]): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    const workSets = sets.filter((set) => !set.isWarmup)

    await applySessionExerciseTemplate(
      trackerSessionId,
      exerciseId,
      workSets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
      })),
    )

    const entries = await listSessionExerciseEntries(trackerSessionId, exerciseId)

    setSetsByExercise((current) => ({
      ...current,
      [exerciseId]: entries,
    }))

    const exercise = exerciseMap[exerciseId]
    if (exercise) {
      setDraftsByExercise((current) => ({
        ...current,
        [exerciseId]: buildSetDraftsFromEntries(entries, exercise.progressionSettings.workSetsTarget),
      }))
    }

    await refreshHistoryForExercise(exerciseId)
    setHistorySheet(null)
    setError('')
    showSavedFeedback()
  }

  async function handleOpenHistorySheet(exercise: Exercise): Promise<void> {
    const rows = historyByExercise[exercise.id] ?? (await listExerciseHistory(exercise.id, 5))

    setHistorySheet({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      rows,
    })
  }

  async function handleSaveQuickEntry(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    const quickDraft = ensureSetDraftLength(draftsByExercise[exerciseId] ?? [], 1)[0]
    const weight = parseWeight(quickDraft.weight)
    const reps = parseReps(quickDraft.reps)

    if (weight <= 0 || reps <= 0) {
      setError('Enter both weight and reps before saving.')
      return
    }

    try {
      const entry = await addSetEntry(trackerSessionId, exerciseId, {
        weight,
        reps,
        completed: true,
      })

      setSetsByExercise((current) => ({
        ...current,
        [exerciseId]: [...(current[exerciseId] ?? []), entry],
      }))

      await refreshHistoryForExercise(exerciseId)
      setMessage('Set saved.')
      setError('')
      showSavedFeedback()
    } catch {
      setError('Could not save set.')
    }
  }

  function handleNoteChange(exerciseId: string, value: string): void {
    setNotesByExercise((current) => ({
      ...current,
      [exerciseId]: value,
    }))

    if (trackerSessionId) {
      localStorage.setItem(noteStorageKey(trackerSessionId, exerciseId), value)
      showSavedFeedback()
    }
  }

  async function handleCreateRoutine(): Promise<void> {
    const routineName = getNextRoutineName(routines)
    const routine = await createRoutine(routineName, [])

    setRoutines((current) => [...current, routine])
    setSelectedRoutineId(routine.id)
    setMode('edit')
    setMessage(`Created ${routine.name}.`)
    setError('')
  }

  async function handleAddExerciseToDraft(): Promise<void> {
    const query = addExerciseName.trim()
    if (!query) {
      return
    }

    let exercise = exercises.find((item) => item.name.toLowerCase() === query.toLowerCase())

    if (!exercise) {
      const created = await createExercise({
        name: query,
        unitDefault: defaultUnit,
      })

      const createdExercise: Exercise = {
        ...created,
        progressionSettings: {
          ...created.progressionSettings,
          weightIncrement: defaultWeightIncrement,
        },
      }
      exercise = createdExercise

      await updateExercise(exercise.id, {
        progressionSettings: exercise.progressionSettings,
      })

      setExercises((current) => [...current, createdExercise])
    }

    if (!exercise) {
      return
    }

    setExerciseDrafts((current) => {
      if (current.some((item) => item.id === exercise.id)) {
        return current
      }

      return [...current, toRoutineExerciseDraft(exercise)]
    })

    setAddExerciseName('')
    setMessage('Exercise ready. Save routine to apply order and settings.')
    setError('')
  }

  function moveExerciseDraft(exerciseId: string, direction: -1 | 1): void {
    setExerciseDrafts((current) => {
      const index = current.findIndex((item) => item.id === exerciseId)
      if (index < 0) {
        return current
      }

      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  async function handleSaveRoutineEdits(): Promise<void> {
    if (!selectedRoutine) {
      return
    }

    const routineName = routineNameDraft.trim()
    if (!routineName) {
      setError('Routine name is required.')
      return
    }

    const sanitized = exerciseDrafts.map((draft) => {
      const repMin = Math.max(1, Math.round(Number(draft.repMin) || 1))
      const repMax = Math.max(repMin, Math.round(Number(draft.repMax) || repMin))
      const workSetsTarget = Math.max(1, Math.round(Number(draft.workSetsTarget) || 1))
      const weightIncrement = Math.max(0.1, Number(draft.weightIncrement) || 0.1)

      return {
        ...draft,
        name: draft.name.trim(),
        repMin,
        repMax,
        workSetsTarget,
        weightIncrement,
      }
    })

    if (sanitized.some((draft) => !draft.name)) {
      setError('Exercise names cannot be blank.')
      return
    }

    for (const draft of sanitized) {
      const currentExercise = exerciseMap[draft.id]
      if (!currentExercise) {
        continue
      }

      await updateExercise(draft.id, {
        name: draft.name,
        unitDefault: draft.unit,
        progressionSettings: {
          ...currentExercise.progressionSettings,
          unit: draft.unit,
          repMin: draft.repMin,
          repMax: draft.repMax,
          workSetsTarget: draft.workSetsTarget,
          weightIncrement: draft.weightIncrement,
        },
      })
    }

    await updateRoutine(selectedRoutine.id, {
      name: routineName,
      exerciseIds: sanitized.map((draft) => draft.id),
    })

    setMode('today')
    setExpandedExerciseId(null)
    setMessage('Routine saved.')
    setError('')
    await loadData()
  }

  async function handleDeleteRoutine(): Promise<void> {
    if (!selectedRoutine) {
      return
    }

    if (routines.length <= 1) {
      setError('At least one routine is required.')
      return
    }

    await deleteRoutine(selectedRoutine.id)

    const remaining = routines.filter((routine) => routine.id !== selectedRoutine.id)
    setRoutines(remaining)
    setSelectedRoutineId(remaining[0]?.id ?? '')
    setMode('today')
    setMessage(`${selectedRoutine.name} deleted.`)
    setError('')
  }

  function updateExerciseDraft(
    exerciseId: string,
    updater: (current: RoutineExerciseDraft) => RoutineExerciseDraft,
  ): void {
    setExerciseDrafts((current) =>
      current.map((item) => (item.id === exerciseId ? updater(item) : item)),
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <div className="row row--between row--center">
          <h1>Routines</h1>
          <span className={savedVisible ? 'saved-pill saved-pill--visible' : 'saved-pill'}>
            Saved
          </span>
        </div>
        <p>Today mode is built for fast logging. Edit mode handles setup.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel panel--compact">
        <div className="mode-toggle" role="tablist" aria-label="Routine modes">
          <button
            type="button"
            className={mode === 'today' ? 'mode-toggle__button mode-toggle__button--active' : 'mode-toggle__button'}
            onClick={() => setMode('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={mode === 'edit' ? 'mode-toggle__button mode-toggle__button--active' : 'mode-toggle__button'}
            onClick={() => setMode('edit')}
          >
            Edit routine
          </button>
        </div>

        <div className="day-picker">
          {orderedRoutines.map((routine) => {
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

        <button type="button" className="button" onClick={() => void handleCreateRoutine()}>
          Create routine
        </button>
      </div>

      {mode === 'today' ? (
        <div className="today-list">
          {selectedExerciseIds.map((exerciseId) => {
            const exercise = exerciseMap[exerciseId]
            if (!exercise) {
              return null
            }

            const isExpanded = expandedExerciseId === exercise.id
            const targetSets = exercise.progressionSettings.workSetsTarget
            const setDrafts = ensureSetDraftLength(draftsByExercise[exercise.id] ?? [], targetSets)
            const historyRows = historyByExercise[exercise.id] ?? []
            const lastSummary = formatLastSummary(historyRows[0]?.sets)
            const suggestionSummary = formatSuggestedSummary(exercise, historyRows[0]?.sets)

            return (
              <article
                key={exercise.id}
                className={isExpanded ? 'today-card today-card--expanded' : 'today-card'}
                onClick={() => handleCardClick(exercise.id)}
              >
                <div className="today-card__top">
                  <div>
                    <h3>{exercise.name}</h3>
                    <p className="muted">Last: {lastSummary}</p>
                    <p className="muted">Suggested: {suggestionSummary}</p>
                  </div>
                  <div className="today-card__icon-actions">
                    <button
                      type="button"
                      className="icon-circle"
                      aria-label={`Open history for ${exercise.name}`}
                      onClick={(event) => {
                        stopCardToggle(event)
                        void handleOpenHistorySheet(exercise)
                      }}
                    >
                      🕘
                    </button>
                    <button
                      type="button"
                      className="icon-circle"
                      aria-label={`Save set for ${exercise.name}`}
                      onClick={(event) => {
                        stopCardToggle(event)
                        void handleSaveQuickEntry(exercise.id)
                      }}
                    >
                      ✓
                    </button>
                  </div>
                </div>

                <div className="today-card__quick" onClick={stopCardToggle}>
                  <StepperField
                    label="Weight"
                    inputMode="decimal"
                    value={setDrafts[0].weight}
                    step={exercise.progressionSettings.weightIncrement}
                    onValueChange={(value) =>
                      handleSetDraftChange(exercise.id, 0, 'weight', value)
                    }
                    onStepAdjust={(direction) =>
                      handleSetStepAdjust(
                        exercise.id,
                        0,
                        'weight',
                        exercise.progressionSettings.weightIncrement,
                        direction,
                      )
                    }
                  />
                  <StepperField
                    label="Reps"
                    inputMode="numeric"
                    value={setDrafts[0].reps}
                    step={1}
                    onValueChange={(value) =>
                      handleSetDraftChange(exercise.id, 0, 'reps', value)
                    }
                    onStepAdjust={(direction) =>
                      handleSetStepAdjust(exercise.id, 0, 'reps', 1, direction)
                    }
                  />
                </div>

                {isExpanded ? (
                  <div className="today-card__expanded" onClick={stopCardToggle}>
                    <div className="set-editor-list">
                      {Array.from({ length: targetSets }).map((_, index) => (
                        <div key={`${exercise.id}-${index}`} className="set-editor-row">
                          <span className="set-editor-row__label">Set {index + 1}</span>
                          <StepperField
                            label={`Set ${index + 1} weight`}
                            inputMode="decimal"
                            value={setDrafts[index].weight}
                            step={exercise.progressionSettings.weightIncrement}
                            onValueChange={(value) =>
                              handleSetDraftChange(exercise.id, index, 'weight', value)
                            }
                            onStepAdjust={(direction) =>
                              handleSetStepAdjust(
                                exercise.id,
                                index,
                                'weight',
                                exercise.progressionSettings.weightIncrement,
                                direction,
                              )
                            }
                          />
                          <StepperField
                            label={`Set ${index + 1} reps`}
                            inputMode="numeric"
                            value={setDrafts[index].reps}
                            step={1}
                            onValueChange={(value) =>
                              handleSetDraftChange(exercise.id, index, 'reps', value)
                            }
                            onStepAdjust={(direction) =>
                              handleSetStepAdjust(exercise.id, index, 'reps', 1, direction)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="button button--small"
                      onClick={() =>
                        void handleUseTemplate(exercise.id, historyRows[0]?.sets ?? [])
                      }
                      disabled={!historyRows[0]?.sets.length}
                    >
                      Use last session as template
                    </button>

                    <label className="stack stack--tight">
                      <span>Notes</span>
                      <textarea
                        className="notes-input"
                        value={notesByExercise[exercise.id] ?? ''}
                        onChange={(event) => handleNoteChange(exercise.id, event.target.value)}
                        rows={2}
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            )
          })}

        </div>
      ) : (
        <div className="panel panel--compact">
          <h2>Edit routine</h2>

          <label className="stack stack--tight">
            <span>Routine name</span>
            <input
              value={routineNameDraft}
              onChange={(event) => setRoutineNameDraft(event.target.value)}
            />
          </label>

          <div className="add-row">
            <input
              value={addExerciseName}
              onChange={(event) => setAddExerciseName(event.target.value)}
              placeholder="Add exercise"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleAddExerciseToDraft()
                }
              }}
            />
            <button
              type="button"
              className="button button--small"
              onClick={() => void handleAddExerciseToDraft()}
            >
              Add
            </button>
          </div>

          <div className="edit-exercise-list">
            {exerciseDrafts.map((draft, index) => (
              <article
                key={draft.id}
                className="list-card edit-exercise-row"
              >
                <div className="row row--between row--center">
                  <div className="row row--center edit-exercise-row__title">
                    <span className="drag-handle" aria-hidden="true">
                      ⋮⋮
                    </span>
                    <h3>{draft.name || 'Exercise'}</h3>
                  </div>
                  <div className="edit-exercise-row__actions">
                    <button
                      type="button"
                      className="icon-link"
                      onClick={() => moveExerciseDraft(draft.id, -1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-link"
                      onClick={() => moveExerciseDraft(draft.id, 1)}
                      disabled={index === exerciseDrafts.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-link icon-link--danger"
                      onClick={() =>
                        setExerciseDrafts((current) =>
                          current.filter((item) => item.id !== draft.id),
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <label className="stack stack--tight">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      updateExerciseDraft(draft.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="input-grid">
                  <label className="stack stack--tight">
                    <span>Unit</span>
                    <select
                      value={draft.unit}
                      onChange={(event) =>
                        updateExerciseDraft(draft.id, (current) => ({
                          ...current,
                          unit: event.target.value as Unit,
                        }))
                      }
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </label>

                  <label className="stack stack--tight">
                    <span>Sets</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={draft.workSetsTarget}
                      onChange={(event) =>
                        updateExerciseDraft(draft.id, (current) => ({
                          ...current,
                          workSetsTarget: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="stack stack--tight">
                    <span>Rep min</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={draft.repMin}
                      onChange={(event) =>
                        updateExerciseDraft(draft.id, (current) => ({
                          ...current,
                          repMin: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="stack stack--tight">
                    <span>Rep max</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={draft.repMax}
                      onChange={(event) =>
                        updateExerciseDraft(draft.id, (current) => ({
                          ...current,
                          repMax: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="stack stack--tight">
                    <span>Weight increment</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      step="0.1"
                      value={draft.weightIncrement}
                      onChange={(event) =>
                        updateExerciseDraft(draft.id, (current) => ({
                          ...current,
                          weightIncrement: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void handleSaveRoutineEdits()}
            >
              Save routine
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => void handleDeleteRoutine()}
            >
              Delete routine
            </button>
          </div>
        </div>
      )}

      {historySheet ? (
        <div className="modal-backdrop" onClick={() => setHistorySheet(null)}>
          <section
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${historySheet.exerciseName} history`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="history-modal__header">
              <h2>{historySheet.exerciseName}</h2>
              <button
                type="button"
                className="icon-link"
                onClick={() => setHistorySheet(null)}
                aria-label="Close history"
              >
                ✕
              </button>
            </header>

            <div className="history-modal__table">
              {historySheet.rows.length === 0 ? (
                <p className="muted">No history yet.</p>
              ) : (
                historySheet.rows.map((row) => (
                  <button
                    key={row.session.id}
                    type="button"
                    className="history-entry"
                    onClick={() => void handleUseTemplate(historySheet.exerciseId, row.sets)}
                  >
                    <span>{formatDateTime(getHistoryTimestamp(row.session, row.sets))}</span>
                    <span>{formatSetList(row.sets)}</span>
                    <span className="history-entry__action">Use as template</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

interface StepperFieldProps {
  label: string
  inputMode: 'decimal' | 'numeric'
  value: string
  step: number
  onValueChange: (value: string) => void
  onStepAdjust: (direction: -1 | 1) => void
}

function StepperField(props: StepperFieldProps) {
  return (
    <label className="stepper-field">
      <span>{props.label}</span>
      <div className="stepper-control">
        <button type="button" className="stepper-button" onClick={() => props.onStepAdjust(-1)}>
          -
        </button>
        <input
          type="number"
          inputMode={props.inputMode}
          min="0"
          step={props.step}
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
        />
        <button type="button" className="stepper-button" onClick={() => props.onStepAdjust(1)}>
          +
        </button>
      </div>
    </label>
  )
}

function noteStorageKey(sessionId: string, exerciseId: string): string {
  return `workout-tracker.notes.${sessionId}.${exerciseId}`
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

function ensureSetDraftLength(drafts: SetDraft[], target: number): SetDraft[] {
  const next = drafts.map((draft) => ({ ...draft }))

  while (next.length < target) {
    next.push({ weight: '', reps: '' })
  }

  return next.slice(0, target)
}

function buildSetDraftsFromEntries(
  entries: SetEntry[],
  target: number,
  existingDrafts?: SetDraft[],
): SetDraft[] {
  const next = ensureSetDraftLength(existingDrafts ?? [], target)

  for (let index = 0; index < target; index += 1) {
    const entry = entries.find((item) => item.index === index)
    if (!entry) {
      continue
    }

    const existingDraft = existingDrafts?.[index]
    const hasTypedValue = Boolean(existingDraft?.weight) || Boolean(existingDraft?.reps)
    if (hasTypedValue) {
      continue
    }

    next[index] = {
      weight: entry.weight > 0 ? formatNumber(entry.weight) : '',
      reps: entry.reps > 0 ? String(entry.reps) : '',
    }
  }

  return next
}

function toRoutineExerciseDraft(exercise: Exercise): RoutineExerciseDraft {
  return {
    id: exercise.id,
    name: exercise.name,
    unit: exercise.progressionSettings.unit,
    repMin: String(exercise.progressionSettings.repMin),
    repMax: String(exercise.progressionSettings.repMax),
    workSetsTarget: String(exercise.progressionSettings.workSetsTarget),
    weightIncrement: formatNumber(exercise.progressionSettings.weightIncrement),
  }
}

function parseWeight(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }

  return numeric
}

function parseReps(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }

  return Math.round(numeric)
}

function formatLastSummary(lastSets: SetEntry[] | undefined): string {
  if (!lastSets || lastSets.length === 0) {
    return 'none'
  }

  const latestWorkSet = [...lastSets].reverse().find((set) => !set.isWarmup)
  if (!latestWorkSet) {
    return 'none'
  }

  return `${formatNumber(latestWorkSet.weight)} x ${latestWorkSet.reps}`
}

function formatSuggestedSummary(exercise: Exercise, lastSets: SetEntry[] | undefined): string {
  if (!lastSets || lastSets.length === 0) {
    return 'none'
  }

  const suggestion = buildProgressionSuggestion(exercise.progressionSettings, lastSets)
  if (!suggestion) {
    return 'none'
  }

  const previousReps = lastSets.filter((set) => !set.isWarmup).map((set) => set.reps)
  const changedIndex = suggestion.nextReps.findIndex((reps, index) => reps !== previousReps[index])
  const suggestedReps = suggestion.nextReps[changedIndex >= 0 ? changedIndex : 0]

  if (typeof suggestedReps !== 'number') {
    return 'none'
  }

  return `${formatNumber(suggestion.suggestedWeight)} x ${suggestedReps}`
}

function formatSetList(sets: SetEntry[]): string {
  const workSets = sets.filter((set) => !set.isWarmup)
  if (workSets.length === 0) {
    return 'No sets'
  }

  return workSets
    .map((set) => `${formatNumber(set.weight)} x ${set.reps}`)
    .join(' · ')
}

function getHistoryTimestamp(session: SessionRecord, sets: SetEntry[]): string {
  const completedAtValues = sets
    .map((set) => set.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))

  return completedAtValues[0] ?? session.endedAt ?? session.startedAt
}

function getNextRoutineName(routines: Routine[]): string {
  const names = new Set(routines.map((routine) => routine.name.toLowerCase()))

  let index = 1
  while (names.has(`routine ${index}`)) {
    index += 1
  }

  return `Routine ${index}`
}
