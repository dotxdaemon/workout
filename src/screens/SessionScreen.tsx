import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  addSetEntry,
  createExercise,
  ensureCoreRoutines,
  getOrCreateTrackerSession,
  getSetInputPrefillFromLastSession,
  listExerciseHistory,
  listExercises,
  listSessionSetEntries,
  removeExerciseFromSession,
} from '../lib/db'
import { formatDateTime, formatNumber } from '../lib/format'
import { readPreferences } from '../lib/preferences'
import { calculateEstimatedOneRepMax } from '../lib/progression'
import type { Exercise, SetEntry, Unit } from '../types'

interface SetDraft {
  weight: string
  reps: string
}

interface ExerciseHistoryModal {
  exercise: Exercise
  rows: Array<{
    sessionId: string
    endedAt: string
    bestSet: string
  }>
}

export function SessionScreen() {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const exerciseCardRefs = useRef<Record<string, HTMLElement | null>>({})
  const weightInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([])
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({})
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftsByExercise, setDraftsByExercise] = useState<Record<string, SetDraft>>({})
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [historyModal, setHistoryModal] = useState<ExerciseHistoryModal | null>(null)
  const [error, setError] = useState('')

  const availableExercises = useMemo(
    () => Object.values(exerciseMap).sort((a, b) => a.name.localeCompare(b.name)),
    [exerciseMap],
  )

  const queryText = query.trim()
  const queryLower = queryText.toLowerCase()
  const sessionExerciseIds = useMemo(() => new Set(exerciseOrder), [exerciseOrder])

  const matchingExercises = useMemo(() => {
    if (!queryText) {
      return []
    }

    return availableExercises.filter((exercise) =>
      exercise.name.toLowerCase().includes(queryLower),
    )
  }, [availableExercises, queryLower, queryText])

  const exactMatch = useMemo(
    () =>
      availableExercises.find(
        (exercise) => exercise.name.toLowerCase() === queryLower && queryLower.length > 0,
      ),
    [availableExercises, queryLower],
  )

  const searchSuggestions = useMemo(() => {
    if (!queryText) {
      return []
    }

    const suggestions: Array<
      | { kind: 'create'; label: string }
      | { kind: 'existing'; exercise: Exercise; label: string }
    > = []

    if (!exactMatch) {
      suggestions.push({
        kind: 'create',
        label: `Create "${queryText}" and add`,
      })
    }

    for (const exercise of matchingExercises) {
      if (sessionExerciseIds.has(exercise.id)) {
        continue
      }

      suggestions.push({
        kind: 'existing',
        exercise,
        label: exercise.name,
      })

      if (suggestions.length >= 6) {
        break
      }
    }

    return suggestions
  }, [exactMatch, matchingExercises, queryText, sessionExerciseIds])

  const loadSessionData = useCallback(async () => {
    const preferences = readPreferences()
    await ensureCoreRoutines(preferences.defaultUnit)
    const trackerSession = await getOrCreateTrackerSession()

    const [allExercises, allEntries] = await Promise.all([
      listExercises(),
      listSessionSetEntries(trackerSession.id),
    ])

    const groupedSets = groupSetsByExercise(allEntries)
    const mergedOrder = Array.from(new Set(allEntries.map((entry) => entry.exerciseId)))

    const mostRecentExerciseId = getMostRecentlyUsedExerciseId(allEntries, mergedOrder)

    setTrackerSessionId(trackerSession.id)
    setExerciseMap(Object.fromEntries(allExercises.map((exercise) => [exercise.id, exercise])))
    setSetsByExercise(groupedSets)
    setExerciseOrder(mergedOrder)
    setExpandedExerciseId(mostRecentExerciseId)
    setDefaultUnit(preferences.defaultUnit)
  }, [])

  useEffect(() => {
    void loadSessionData().catch(() => {
      setError('Unable to load tracker.')
    })
  }, [loadSessionData])

  useEffect(() => {
    if (!trackerSessionId) {
      return
    }

    searchInputRef.current?.focus()
  }, [trackerSessionId])

  async function refreshSets(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    const entries = await listSessionSetEntries(trackerSessionId)
    setSetsByExercise(groupSetsByExercise(entries))

    if (!exerciseOrder.includes(exerciseId)) {
      setExerciseOrder((current) => [...current, exerciseId])
    }
  }

  const prefillDraftFromLastSession = useCallback(
    async (exerciseId: string): Promise<void> => {
      const existing = draftsByExercise[exerciseId]
      if (existing && (existing.weight.length > 0 || existing.reps.length > 0)) {
        return
      }

      const nextSetIndex = setsByExercise[exerciseId]?.length ?? 0
      const prefill = await getSetInputPrefillFromLastSession(exerciseId, nextSetIndex)
      if (!prefill) {
        return
      }

      setDraftsByExercise((current) => {
        const currentDraft = current[exerciseId]
        if (currentDraft && (currentDraft.weight.length > 0 || currentDraft.reps.length > 0)) {
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
    },
    [draftsByExercise, setsByExercise],
  )

  useEffect(() => {
    if (!expandedExerciseId) {
      return
    }

    void prefillDraftFromLastSession(expandedExerciseId)
  }, [expandedExerciseId, prefillDraftFromLastSession])

  useEffect(() => {
    if (!historyModal) {
      return
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setHistoryModal(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [historyModal])

  function scrollExerciseIntoView(exerciseId: string): void {
    requestAnimationFrame(() => {
      exerciseCardRefs.current[exerciseId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }

  function focusWeightInput(exerciseId: string): void {
    requestAnimationFrame(() => {
      weightInputRefs.current[exerciseId]?.focus()
    })
  }

  async function addExerciseToSession(exercise: Exercise): Promise<void> {
    setExerciseMap((current) => ({
      ...current,
      [exercise.id]: exercise,
    }))

    setExerciseOrder((current) =>
      current.includes(exercise.id) ? current : [...current, exercise.id],
    )

    setExpandedExerciseId(exercise.id)
    setQuery('')
    setError('')

    scrollExerciseIntoView(exercise.id)
    await prefillDraftFromLastSession(exercise.id)
    focusWeightInput(exercise.id)
    searchInputRef.current?.focus()
  }

  async function handleAddExerciseFromQuery(): Promise<void> {
    if (!queryText) {
      return
    }

    const existingMatch =
      exactMatch ??
      matchingExercises.find(
        (exercise) => exercise.name.toLowerCase().startsWith(queryLower),
      ) ??
      matchingExercises[0]

    if (existingMatch) {
      await addExerciseToSession(existingMatch)
      return
    }

    const createdExercise = await createExercise({
      name: queryText,
      unitDefault: defaultUnit,
    })

    await addExerciseToSession(createdExercise)
  }

  async function handleAddSet(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    const draft = draftsByExercise[exerciseId] ?? { weight: '', reps: '' }
    const weight = Number(draft.weight)

    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Weight is required.')
      focusWeightInput(exerciseId)
      return
    }

    const repsValue = draft.reps.trim().length === 0 ? 0 : Number(draft.reps)
    if (!Number.isFinite(repsValue) || repsValue < 0) {
      setError('Reps must be a number or blank.')
      return
    }

    await addSetEntry(trackerSessionId, exerciseId, {
      weight,
      reps: repsValue,
      completed: true,
    })

    await refreshSets(exerciseId)

    setDraftsByExercise((current) => ({
      ...current,
      [exerciseId]: {
        weight: '',
        reps: '',
      },
    }))

    setExpandedExerciseId(exerciseId)
    setError('')
    focusWeightInput(exerciseId)
  }

  async function handleRemoveExercise(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }

    await removeExerciseFromSession(trackerSessionId, exerciseId)

    setExerciseOrder((current) => current.filter((id) => id !== exerciseId))
    setSetsByExercise((current) => {
      const next = { ...current }
      delete next[exerciseId]
      return next
    })
    setDraftsByExercise((current) => {
      const next = { ...current }
      delete next[exerciseId]
      return next
    })

    if (expandedExerciseId === exerciseId) {
      const remainingExerciseId = exerciseOrder.find((id) => id !== exerciseId)
      setExpandedExerciseId(remainingExerciseId ?? null)
    }
  }

  function handleCopyLastSet(exerciseId: string): void {
    const sets = setsByExercise[exerciseId] ?? []
    const lastSet = sets.at(-1)
    if (!lastSet) {
      return
    }

    setDraftsByExercise((current) => ({
      ...current,
      [exerciseId]: {
        weight: formatNumber(lastSet.weight),
        reps: lastSet.reps > 0 ? String(lastSet.reps) : '',
      },
    }))

    focusWeightInput(exerciseId)
  }

  function toggleExercise(exerciseId: string): void {
    const willExpand = expandedExerciseId !== exerciseId
    setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId))

    if (willExpand) {
      void prefillDraftFromLastSession(exerciseId)
      focusWeightInput(exerciseId)
    }
  }

  function handleSetInputChange(
    exerciseId: string,
    field: keyof SetDraft,
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

  function handleSetInputKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    exerciseId: string,
  ): void {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    void handleAddSet(exerciseId)
  }

  async function handleOpenHistory(exercise: Exercise): Promise<void> {
    const sessions = await listExerciseHistory(exercise.id, 10)

    const rows = sessions.map(({ session: itemSession, sets }) => {
      const bestSet = pickBestSet(sets)
      return {
        sessionId: itemSession.id,
        endedAt: itemSession.endedAt ?? itemSession.startedAt,
        bestSet: bestSet
          ? `${formatNumber(bestSet.weight)} x ${bestSet.reps}`
          : '-',
      }
    })

    setHistoryModal({
      exercise,
      rows,
    })
  }

  return (
    <section className="page session-page">
      <header className="page-header session-header">
        <div>
          <h1>Tracker</h1>
          <p>Log exercises and weight.</p>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel panel--compact">
        <h2>Add exercise</h2>
        <div className="add-row">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleAddExerciseFromQuery()
              }
            }}
          />
          <button type="button" className="button button--small" onClick={() => void handleAddExerciseFromQuery()}>
            Add
          </button>
        </div>

        {searchSuggestions.length > 0 ? (
          <div className="suggestions-list">
            {searchSuggestions.map((suggestion) =>
              suggestion.kind === 'create' ? (
                <button
                  key={`create-${queryLower}`}
                  type="button"
                  className="suggestion-button"
                  onClick={() => void handleAddExerciseFromQuery()}
                >
                  {suggestion.label}
                </button>
              ) : (
                <button
                  key={suggestion.exercise.id}
                  type="button"
                  className="suggestion-button"
                  onClick={() => void addExerciseToSession(suggestion.exercise)}
                >
                  {suggestion.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>

      <div className="session-exercise-list">
        {exerciseOrder.map((exerciseId) => {
          const exercise = exerciseMap[exerciseId]
          if (!exercise) {
            return null
          }

          const sets = setsByExercise[exerciseId] ?? []
          const nextSetNumber = sets.length + 1
          const isExpanded = expandedExerciseId === exerciseId
          const draft = draftsByExercise[exerciseId] ?? { weight: '', reps: '' }

          return (
            <article
              key={exercise.id}
              className="exercise-card"
              ref={(node) => {
                exerciseCardRefs.current[exercise.id] = node
              }}
            >
              <div className="exercise-card__header">
                <button
                  type="button"
                  className="exercise-card__title"
                  onClick={() => toggleExercise(exercise.id)}
                >
                  {exercise.name}
                  <span className="exercise-card__unit">
                    {exercise.progressionSettings.unit}
                  </span>
                </button>

                <div className="exercise-card__actions">
                  <button
                    type="button"
                    className="icon-link"
                    onClick={() => void handleOpenHistory(exercise)}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    className="icon-link icon-link--danger"
                    onClick={() => void handleRemoveExercise(exercise.id)}
                    aria-label={`Remove ${exercise.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div className="exercise-card__body">
                  <div className="set-table" role="table" aria-label={`${exercise.name} sets`}>
                    <div className="set-table__head" role="row">
                      <span>Set</span>
                      <span>Wt</span>
                      <span>Reps</span>
                      <span className="set-table__actions"> </span>
                    </div>

                    {sets.map((setEntry) => (
                      <div key={setEntry.id} className="set-table__row" role="row">
                        <span>{setEntry.index + 1}</span>
                        <span>{formatNumber(setEntry.weight)}</span>
                        <span>{setEntry.reps > 0 ? setEntry.reps : ''}</span>
                        <span className="set-table__actions"> </span>
                      </div>
                    ))}

                    <div className="set-table__row set-table__row--input" role="row">
                      <span>{nextSetNumber}</span>
                      <input
                        ref={(node) => {
                          weightInputRefs.current[exercise.id] = node
                        }}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.5"
                        value={draft.weight}
                        onChange={(event) =>
                          handleSetInputChange(exercise.id, 'weight', event.target.value)
                        }
                        onKeyDown={(event) => handleSetInputKeyDown(event, exercise.id)}
                        aria-label={`${exercise.name} weight`}
                      />
                      <input
                        inputMode="numeric"
                        type="number"
                        min="0"
                        step="1"
                        value={draft.reps}
                        onChange={(event) =>
                          handleSetInputChange(exercise.id, 'reps', event.target.value)
                        }
                        onKeyDown={(event) => handleSetInputKeyDown(event, exercise.id)}
                        aria-label={`${exercise.name} reps`}
                      />
                      <div className="set-table__actions">
                        <button
                          type="button"
                          className="icon-link"
                          onClick={() => handleCopyLastSet(exercise.id)}
                          aria-label={`Copy last set for ${exercise.name}`}
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          className="button button--small"
                          onClick={() => void handleAddSet(exercise.id)}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {historyModal ? (
        <div className="modal-backdrop" onClick={() => setHistoryModal(null)}>
          <section
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${historyModal.exercise.name} history`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="history-modal__header">
              <h2>{historyModal.exercise.name}</h2>
              <button
                type="button"
                className="icon-link"
                onClick={() => setHistoryModal(null)}
                aria-label="Close history"
              >
                ✕
              </button>
            </header>

            <div className="history-modal__table" role="table" aria-label="Recent history">
              <div className="set-table__head" role="row">
                <span>Date</span>
                <span>Best set</span>
              </div>
              {historyModal.rows.map((row) => (
                <div key={row.sessionId} className="history-modal__row" role="row">
                  <span>{formatDateTime(row.endedAt)}</span>
                  <span>
                    {row.bestSet}
                    {row.bestSet !== '-' ? ` ${historyModal.exercise.progressionSettings.unit}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
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

function getMostRecentlyUsedExerciseId(
  entries: SetEntry[],
  fallbackOrder: string[],
): string | null {
  if (entries.length === 0) {
    return fallbackOrder[0] ?? null
  }

  const withCompletedAt = entries
    .filter((entry) => Boolean(entry.completedAt))
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))

  if (withCompletedAt.length > 0) {
    return withCompletedAt.at(-1)?.exerciseId ?? fallbackOrder[0] ?? null
  }

  const setCounts = new Map<string, number>()
  for (const entry of entries) {
    setCounts.set(entry.exerciseId, (setCounts.get(entry.exerciseId) ?? 0) + 1)
  }

  return (
    [...fallbackOrder].reverse().find((exerciseId) => setCounts.has(exerciseId)) ??
    entries[entries.length - 1].exerciseId
  )
}

function pickBestSet(sets: SetEntry[]): SetEntry | null {
  const workSets = sets.filter((set) => !set.isWarmup)
  let best: SetEntry | null = null
  let bestScore = 0

  for (const set of workSets) {
    const score = calculateEstimatedOneRepMax(set.weight, set.reps)
    if (!best || score > bestScore) {
      best = set
      bestScore = score
    }
  }

  return best
}
