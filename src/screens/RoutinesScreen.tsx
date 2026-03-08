// ABOUTME: Renders the routines tab with fast daily logging and separate routine editing mode.
// ABOUTME: Records saved sets and history while keeping admin controls out of the today flow.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, TouchEvent } from 'react'
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
import {
  applyHistorySheetOverlayLock,
  getHistorySheetDragOffset,
  shouldIgnoreHistorySheetBackdropClose,
  shouldAllowHistorySheetDrag,
  shouldCloseHistorySheetAfterDrag,
} from '../lib/historySheet'
import { readPreferences } from '../lib/preferences'
import {
  readActiveRoutineSplitId,
  readSelectedRoutineId,
  writeActiveRoutineSplitId,
  writeSelectedRoutineId,
} from '../lib/routineSelection'
import { routineSplitOptions } from '../lib/routineSplit'
import type { Exercise, Routine, RoutineSplitId, SessionRecord, SetEntry, Unit } from '../types'

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
  isLoading: boolean
}

interface RoutineExerciseDraft {
  draftId: string
  exerciseId: string
  name: string
  unit: Unit
  repMin: string
  repMax: string
  workSetsTarget: string
  weightIncrement: string
}

type ScreenMode = 'today' | 'edit'

export function RoutinesScreen() {
  const historyRequestRef = useRef(0)
  const savedFeedbackTimeoutRef = useRef<number | null>(null)
  const historySheetListRef = useRef<HTMLDivElement | null>(null)
  const historySheetDragStartYRef = useRef<number | null>(null)
  const historySheetStartScrollTopRef = useRef(0)
  const historySheetDragOffsetRef = useRef(0)
  const historySheetDraggingRef = useRef(false)
  const historySheetOpenedAtRef = useRef(0)
  const hydratedRoutineIdRef = useRef<string | null>(null)

  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [historyByExercise, setHistoryByExercise] = useState<Record<string, HistoryItem[]>>({})
  const [activeSplitId, setActiveSplitId] = useState<RoutineSplitId>(() =>
    readActiveRoutineSplitId(),
  )
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [mode, setMode] = useState<ScreenMode>('today')
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [draftsByExercise, setDraftsByExercise] = useState<Record<string, SetDraft[]>>({})
  const [notesByExercise, setNotesByExercise] = useState<Record<string, string>>({})
  const [historySheet, setHistorySheet] = useState<HistorySheetState | null>(null)
  const [historySheetDragOffset, setHistorySheetDragOffset] = useState(0)
  const [historySheetDragging, setHistorySheetDragging] = useState(false)
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState(5)
  const [routineNameDraft, setRoutineNameDraft] = useState('')
  const [exerciseDrafts, setExerciseDrafts] = useState<RoutineExerciseDraft[]>([])
  const [addExerciseName, setAddExerciseName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedExerciseId, setSavedExerciseId] = useState<string | null>(null)

  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  const activeSplit = useMemo(
    () => routineSplitOptions.find((option) => option.id === activeSplitId) ?? routineSplitOptions[0],
    [activeSplitId],
  )

  const splitRoutines = useMemo(
    () => routines.filter((routine) => routine.splitId === activeSplit.id),
    [activeSplit.id, routines],
  )

  const orderedRoutines = useMemo(() => {
    const orderByName = new Map(
      activeSplit.routineOrder.map((name, index) => [name.toLowerCase(), index]),
    )

    return [...splitRoutines].sort((left, right) => {
      const leftIndex = orderByName.get(left.name.toLowerCase())
      const rightIndex = orderByName.get(right.name.toLowerCase())

      if (leftIndex == null && rightIndex == null) {
        return left.name.localeCompare(right.name)
      }
      if (leftIndex == null) {
        return 1
      }
      if (rightIndex == null) {
        return -1
      }

      return leftIndex - rightIndex
    })
  }, [activeSplit.routineOrder, splitRoutines])

  const selectedRoutine = useMemo(
    () => orderedRoutines.find((routine) => routine.id === selectedRoutineId) ?? orderedRoutines[0],
    [orderedRoutines, selectedRoutineId],
  )

  const selectedExerciseIds = useMemo(
    () => selectedRoutine?.exerciseIds ?? [],
    [selectedRoutine],
  )

  const selectedRoutineIndex = useMemo(
    () =>
      selectedRoutine
        ? orderedRoutines.findIndex((routine) => routine.id === selectedRoutine.id)
        : -1,
    [orderedRoutines, selectedRoutine],
  )

  const dayHeading = useMemo(
    () => buildDayHeading(selectedRoutine?.name, selectedRoutineIndex),
    [selectedRoutine?.name, selectedRoutineIndex],
  )

  const routineFocusLabel = useMemo(
    () => getRoutineFocusLabel(selectedRoutine?.name),
    [selectedRoutine?.name],
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
  }, [])

  useEffect(() => {
    void loadData().catch(() => {
      setError('Could not load routines.')
    })
  }, [loadData])

  useEffect(() => {
    writeActiveRoutineSplitId(activeSplit.id)
  }, [activeSplit.id])

  useEffect(() => {
    const selectedInSplit = orderedRoutines.find((routine) => routine.id === selectedRoutineId)
    if (selectedInSplit) {
      return
    }

    const storedRoutineId = readSelectedRoutineId(activeSplit.id)
    if (storedRoutineId && orderedRoutines.some((routine) => routine.id === storedRoutineId)) {
      setSelectedRoutineId(storedRoutineId)
      return
    }

    for (const fallbackName of activeSplit.fallbackRoutineNames) {
      const fallback = orderedRoutines.find(
        (routine) => routine.name.toLowerCase() === fallbackName.toLowerCase(),
      )
      if (fallback) {
        setSelectedRoutineId(fallback.id)
        return
      }
    }

    setSelectedRoutineId(orderedRoutines[0]?.id ?? '')
  }, [activeSplit.fallbackRoutineNames, activeSplit.id, orderedRoutines, selectedRoutineId])

  useEffect(() => {
    const selectedInSplit = orderedRoutines.some((routine) => routine.id === selectedRoutineId)
    if (!selectedInSplit) {
      return
    }

    writeSelectedRoutineId(activeSplit.id, selectedRoutineId)
  }, [activeSplit.id, orderedRoutines, selectedRoutineId])

  useEffect(() => {
    if (!trackerSessionId || !selectedRoutine?.id) {
      return
    }

    void assignRoutineToSession(trackerSessionId, selectedRoutine.id).catch(() => {
      setError('Could not associate routine with the current session.')
    })
  }, [selectedRoutine?.id, trackerSessionId])

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
      hydratedRoutineIdRef.current = null
      return
    }

    if (hydratedRoutineIdRef.current === selectedRoutine.id) {
      return
    }

    hydratedRoutineIdRef.current = selectedRoutine.id

    setRoutineNameDraft(selectedRoutine.name)
    setExerciseDrafts(
      selectedRoutine.exerciseIds
        .map((exerciseId) => exerciseMap[exerciseId])
        .filter((exercise): exercise is Exercise => Boolean(exercise))
        .map((exercise) => toRoutineExerciseDraft(exercise, createRoutineDraftId(exercise.id))),
    )
    setAddExerciseName('')
  }, [exerciseMap, mode, selectedRoutine])

  useEffect(() => {
    if (!historySheet) {
      return
    }

    const bottomNav = document.querySelector<HTMLElement>('.bottom-nav')
    return applyHistorySheetOverlayLock({ bottomNav })
  }, [historySheet])

  function resetPageScrollToTop(): void {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    if (!scrollingElement) {
      return
    }

    scrollingElement.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  useEffect(() => {
    return () => {
      if (savedFeedbackTimeoutRef.current != null) {
        window.clearTimeout(savedFeedbackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    resetPageScrollToTop()

    const frameId = window.requestAnimationFrame(() => {
      resetPageScrollToTop()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [mode])

  function showSavedFeedback(exerciseId?: string): void {
    if (!exerciseId) {
      return
    }

    setSavedExerciseId(exerciseId)

    if (savedFeedbackTimeoutRef.current != null) {
      window.clearTimeout(savedFeedbackTimeoutRef.current)
    }

    savedFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSavedExerciseId((current) => (current === exerciseId ? null : current))
      savedFeedbackTimeoutRef.current = null
    }, 1400)
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
    closeHistorySheet('user')
    setError('')
    showSavedFeedback()
  }

  async function handleOpenHistorySheet(
    exercise: Exercise,
    openedAtMs: number,
  ): Promise<void> {
    const cachedRows = historyByExercise[exercise.id] ?? []
    historySheetOpenedAtRef.current = openedAtMs

    setHistorySheet({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      rows: cachedRows,
      isLoading: true,
    })
    resetHistorySheetDrag()

    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId

    try {
      const rows = await listExerciseHistory(exercise.id, 5)

      if (historyRequestRef.current !== requestId) {
        return
      }

      setHistoryByExercise((current) => ({
        ...current,
        [exercise.id]: rows,
      }))

      setHistorySheet((current) =>
        current && current.exerciseId === exercise.id
          ? {
              ...current,
              rows,
              isLoading: false,
            }
          : current,
      )
    } catch {
      if (historyRequestRef.current !== requestId) {
        return
      }

      setError('Could not load exercise history.')
      setHistorySheet((current) =>
        current
          ? {
              ...current,
              rows: [],
              isLoading: false,
            }
          : current,
      )
    }
  }

  function closeHistorySheet(
    reason: 'backdrop' | 'user' | 'drag' = 'user',
    actionAtMs?: number,
  ): void {
    if (
      reason === 'backdrop' &&
      shouldIgnoreHistorySheetBackdropClose(
        historySheetOpenedAtRef.current,
        actionAtMs ?? historySheetOpenedAtRef.current,
      )
    ) {
      return
    }

    historyRequestRef.current += 1
    resetHistorySheetDrag()
    historySheetOpenedAtRef.current = 0
    setHistorySheet(null)
  }

  function handleHistoryBackdropClick(event: MouseEvent<HTMLDivElement>): void {
    closeHistorySheet('backdrop', event.timeStamp)
  }

  function resetHistorySheetDrag(): void {
    historySheetDragStartYRef.current = null
    historySheetStartScrollTopRef.current = 0
    historySheetDragOffsetRef.current = 0
    historySheetDraggingRef.current = false
    setHistorySheetDragOffset(0)
    setHistorySheetDragging(false)
  }

  function handleHistorySheetTouchStart(event: TouchEvent<HTMLElement>): void {
    const touch = event.touches[0]
    if (!touch) {
      return
    }

    historySheetDragStartYRef.current = touch.clientY

    const listElement = historySheetListRef.current
    const targetNode = event.target as Node | null
    const startedInList = Boolean(listElement && targetNode && listElement.contains(targetNode))
    historySheetStartScrollTopRef.current = startedInList ? (listElement?.scrollTop ?? 0) : 0
  }

  function handleHistorySheetTouchMove(event: TouchEvent<HTMLElement>): void {
    const touch = event.touches[0]
    const startY = historySheetDragStartYRef.current

    if (!touch || startY == null) {
      return
    }

    const dragOffset = getHistorySheetDragOffset(startY, touch.clientY)

    if (!shouldAllowHistorySheetDrag(historySheetStartScrollTopRef.current, dragOffset)) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }

    historySheetDragOffsetRef.current = dragOffset
    historySheetDraggingRef.current = true
    setHistorySheetDragOffset(dragOffset)
    setHistorySheetDragging(true)
  }

  function handleHistorySheetTouchEnd(): void {
    historySheetDragStartYRef.current = null

    if (!historySheetDraggingRef.current) {
      historySheetDragOffsetRef.current = 0
      setHistorySheetDragOffset(0)
      return
    }

    if (shouldCloseHistorySheetAfterDrag(historySheetDragOffsetRef.current)) {
      closeHistorySheet('drag')
      return
    }

    historySheetDragOffsetRef.current = 0
    historySheetDraggingRef.current = false
    setHistorySheetDragOffset(0)
    setHistorySheetDragging(false)
  }

  async function handleSaveQuickEntry(exerciseId: string): Promise<boolean> {
    if (!trackerSessionId) {
      return false
    }

    const quickDraft = ensureSetDraftLength(draftsByExercise[exerciseId] ?? [], 1)[0]
    const weight = parseWeight(quickDraft.weight)
    const reps = parseReps(quickDraft.reps)

    if (weight <= 0 || reps <= 0) {
      setError('Enter both weight and reps before saving.')
      return false
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
      setMessage('')
      setError('')
      showSavedFeedback(exerciseId)
      return true
    } catch {
      setError('Could not save set.')
      return false
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
    const routineName = getNextRoutineName(splitRoutines)
    const routine = await createRoutine(routineName, [], activeSplit.id)

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
      if (current.some((item) => item.exerciseId === exercise.id)) {
        return current
      }

      return [...current, toRoutineExerciseDraft(exercise, createRoutineDraftId(exercise.id))]
    })

    setAddExerciseName('')
    setMessage('Exercise ready. Save routine to apply changes.')
    setError('')
  }

  function moveExerciseDraft(draftId: string, direction: -1 | 1): void {
    setExerciseDrafts((current) => {
      const index = current.findIndex((item) => item.draftId === draftId)
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

    const nextExerciseIds: string[] = []
    const createdExercises: Exercise[] = []

    for (const draft of sanitized) {
      const currentExercise = exerciseMap[draft.exerciseId]
      if (!currentExercise) {
        nextExerciseIds.push(draft.exerciseId)
        continue
      }

      const normalizedDraftName = draft.name.trim().toLowerCase()
      const normalizedExerciseName = currentExercise.name.trim().toLowerCase()

      if (normalizedDraftName !== normalizedExerciseName) {
        const createdExercise = await createExercise({
          name: draft.name,
          unitDefault: draft.unit,
        })

        const progressionSettings = {
          ...currentExercise.progressionSettings,
          unit: draft.unit,
          repMin: draft.repMin,
          repMax: draft.repMax,
          workSetsTarget: draft.workSetsTarget,
          weightIncrement: draft.weightIncrement,
        }

        await updateExercise(createdExercise.id, {
          progressionSettings,
          unitDefault: draft.unit,
        })

        createdExercises.push({
          ...createdExercise,
          progressionSettings,
          unitDefault: draft.unit,
        })
        nextExerciseIds.push(createdExercise.id)
        continue
      }

      await updateExercise(draft.exerciseId, {
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

      nextExerciseIds.push(draft.exerciseId)
    }

    if (createdExercises.length > 0) {
      setExercises((current) => [...current, ...createdExercises])
    }

    await updateRoutine(selectedRoutine.id, {
      name: routineName,
      exerciseIds: nextExerciseIds,
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

    if (splitRoutines.length <= 1) {
      setError('At least one routine is required.')
      return
    }

    await deleteRoutine(selectedRoutine.id)

    const remaining = routines.filter((routine) => routine.id !== selectedRoutine.id)
    const remainingInSplit = remaining.filter((routine) => routine.splitId === activeSplit.id)
    setRoutines(remaining)
    setSelectedRoutineId(remainingInSplit[0]?.id ?? '')
    setMode('today')
    setMessage(`${selectedRoutine.name} deleted.`)
    setError('')
  }

  function updateExerciseDraft(
    draftId: string,
    updater: (current: RoutineExerciseDraft) => RoutineExerciseDraft,
  ): void {
    setExerciseDrafts((current) =>
      current.map((item) => (item.draftId === draftId ? updater(item) : item)),
    )
  }

  return (
    <section className="page">
      <header className="page-header routines-header">
        <div className="routines-header__row">
          <div className="routines-header__title">
            <p className="routines-header__split">{formatSplitHeaderLabel(activeSplit.label)}</p>
            <h1>Routines</h1>
          </div>
          <div className="pill-toggle" role="tablist" aria-label="Routine modes">
            <button
              type="button"
              className={
                mode === 'today'
                  ? 'pill-toggle__button pill-toggle__button--active'
                  : 'pill-toggle__button'
              }
              onClick={() => setMode('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={
                mode === 'edit'
                  ? 'pill-toggle__button pill-toggle__button--active'
                  : 'pill-toggle__button'
              }
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
          </div>
        </div>
        <div className="routines-header__rule" aria-hidden="true" />
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {mode === 'today' ? (
        <div className="today-mode">
          <header className="today-active-day-header">
            <div className="today-active-day-header__meta">
              <p className="today-active-day-header__day">{dayHeading.dayLabel}</p>
              <p className="today-active-day-header__count">
                {selectedRoutine ? `${selectedExerciseIds.length} exercises` : '0 exercises'}
              </p>
            </div>
            <h2>{dayHeading.title}</h2>
          </header>

          {selectedRoutine ? (
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

                return (
                  <article
                    key={exercise.id}
                    className={isExpanded ? 'today-card today-card--expanded' : 'today-card'}
                    onClick={() => handleCardClick(exercise.id)}
                  >
                    <div className="today-card__top">
                      <div>
                        <p className="today-card__group">{routineFocusLabel}</p>
                        <h3>{exercise.name}</h3>
                      </div>
                      <div className="today-card__actions">
                        <button
                          type="button"
                          className="today-card__history-button"
                          aria-label={`Open history for ${exercise.name}`}
                          onClick={(event) => {
                            stopCardToggle(event)
                            void handleOpenHistorySheet(exercise, event.timeStamp)
                          }}
                        >
                          History
                        </button>
                        <button
                          type="button"
                          className="today-card__save-button"
                          aria-label={`Save set for ${exercise.name}`}
                          onClick={(event) => {
                            stopCardToggle(event)
                            void handleSaveQuickEntry(exercise.id)
                          }}
                        >
                          {savedExerciseId === exercise.id ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="today-card__stats">
                      <span className="today-card__stats-label">Last</span>
                      <span className="today-card__stats-value">{lastSummary}</span>
                    </div>

                    <div className="today-input-row" onClick={stopCardToggle}>
                      <CompactField
                        label="Weight"
                        inputMode="decimal"
                        value={setDrafts[0].weight}
                        step={exercise.progressionSettings.weightIncrement}
                        onValueChange={(value) =>
                          handleSetDraftChange(exercise.id, 0, 'weight', value)
                        }
                      />
                      <CompactField
                        label="Reps"
                        inputMode="numeric"
                        value={setDrafts[0].reps}
                        step={1}
                        onValueChange={(value) =>
                          handleSetDraftChange(exercise.id, 0, 'reps', value)
                        }
                      />
                    </div>

                    {isExpanded ? (
                      <div className="today-card__expanded" onClick={stopCardToggle}>
                        <div className="set-editor-list">
                          {Array.from({ length: targetSets }).map((_, index) => (
                            <div key={`${exercise.id}-${index}`} className="set-editor-row">
                              <span className="set-editor-row__label">Set {index + 1}</span>
                              <div className="set-editor-row__fields">
                                <StepperField
                                  label="Weight"
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
                                  label="Reps"
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
          ) : orderedRoutines[0] ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setSelectedRoutineId(orderedRoutines[0].id)}
            >
              Start {dayHeading.dayLabel}
            </button>
          ) : (
            <p className="muted">Create a routine in edit mode to start logging.</p>
          )}
        </div>
      ) : (
        <div className="edit-mode stack">
          <div className="panel panel--compact">
            <div className="edit-split-row">
              <span className="edit-split-row__label">Split type</span>
              <div className="split-toggle-small" role="tablist" aria-label="Routine split">
                {routineSplitOptions.map((split) => (
                  <button
                    key={split.id}
                    type="button"
                    className={
                      activeSplit.id === split.id
                        ? 'split-toggle-small__button split-toggle-small__button--active'
                        : 'split-toggle-small__button'
                    }
                    onClick={() => setActiveSplitId(split.id)}
                  >
                    {formatSplitOptionLabel(split.id)}
                  </button>
                ))}
              </div>
            </div>
            <hr className="edit-split-divider" />

            <div className="day-picker">
              {orderedRoutines.map((routine, index) => {
                const cardState = getRoutineCardState(index, selectedRoutineIndex)
                const cardClassName = getDayButtonClassName(cardState)
                const badgeText = cardState === 'completed' ? '✓' : getRoutineDayNumber(routine.name, index)

                return (
                  <button
                    key={routine.id}
                    type="button"
                    className={cardClassName}
                    onClick={() => setSelectedRoutineId(routine.id)}
                  >
                    <span className={getDayBadgeClassName(cardState)} aria-hidden="true">
                      {badgeText}
                    </span>
                    <span className="day-button__content">
                      <span className="day-button__name">{routine.name}</span>
                      <span className="day-button__meta">
                        <span>{routine.exerciseIds.length} exercises</span>
                        {cardState === 'active' ? (
                          <span className="day-button__status day-button__status--today">TODAY</span>
                        ) : cardState === 'completed' ? (
                          <span className="day-button__status day-button__status--done">DONE</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="day-button__chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="create-routine-button"
              onClick={() => void handleCreateRoutine()}
            >
              <span className="create-routine-button__icon" aria-hidden="true">
                +
              </span>
              <span>Create routine</span>
            </button>
          </div>

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

            <div className="button-row edit-actions-sticky">
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

            <div className="edit-exercise-list">
              {exerciseDrafts.map((draft, index) => (
                <article
                  key={draft.draftId}
                  className="list-card edit-exercise-row"
                >
                  <div className="edit-exercise-row__header">
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
                        onClick={() => moveExerciseDraft(draft.draftId, -1)}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="icon-link"
                        onClick={() => moveExerciseDraft(draft.draftId, 1)}
                        disabled={index === exerciseDrafts.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="icon-link icon-link--danger"
                        onClick={() =>
                          setExerciseDrafts((current) =>
                            current.filter((item) => item.draftId !== draft.draftId),
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
                        updateExerciseDraft(draft.draftId, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {historySheet ? (
        <div className="modal-backdrop" onClick={handleHistoryBackdropClick}>
          <section
            className={historySheetDragging ? 'history-modal history-modal--dragging' : 'history-modal'}
            role="dialog"
            aria-modal="true"
            aria-label={`${historySheet.exerciseName} history`}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={handleHistorySheetTouchStart}
            onTouchMove={handleHistorySheetTouchMove}
            onTouchEnd={handleHistorySheetTouchEnd}
            onTouchCancel={handleHistorySheetTouchEnd}
            style={{ transform: `translateY(${historySheetDragOffset}px)` }}
          >
            <span className="history-modal__grabber" aria-hidden="true" />
            <header className="history-modal__header">
              <h2>{historySheet.exerciseName}</h2>
              <button
                type="button"
                className="icon-link"
                onClick={() => closeHistorySheet('user')}
                aria-label="Close history"
              >
                ✕
              </button>
            </header>

            <div className="history-modal__table" ref={historySheetListRef}>
              {historySheet.rows.length === 0 ? (
                historySheet.isLoading ? (
                  <p className="muted">Loading history...</p>
                ) : (
                  <div className="history-empty-state">
                    <p className="history-empty-state__title">No history yet.</p>
                    <p className="history-empty-state__body">
                      Log a set and it will show up here.
                    </p>
                  </div>
                )
              ) : (
                historySheet.rows.map((row) => (
                  <div
                    key={row.session.id}
                    className="history-entry"
                  >
                    <span>{formatDateTime(getHistoryTimestamp(row.session, row.sets))}</span>
                    <span>{formatSetList(row.sets)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

type RoutineCardState = 'active' | 'completed' | 'upcoming'

interface CompactFieldProps {
  label: string
  inputMode: 'decimal' | 'numeric'
  value: string
  step: number
  onValueChange: (value: string) => void
}

interface StepperFieldProps {
  label: string
  inputMode: 'decimal' | 'numeric'
  value: string
  step: number
  onValueChange: (value: string) => void
  onStepAdjust: (direction: -1 | 1) => void
}

function CompactField(props: CompactFieldProps) {
  return (
    <label className="compact-field">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode={props.inputMode}
        min="0"
        step={props.step}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
      />
    </label>
  )
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

function toRoutineExerciseDraft(exercise: Exercise, draftId: string): RoutineExerciseDraft {
  return {
    draftId,
    exerciseId: exercise.id,
    name: exercise.name,
    unit: exercise.progressionSettings.unit,
    repMin: String(exercise.progressionSettings.repMin),
    repMax: String(exercise.progressionSettings.repMax),
    workSetsTarget: String(exercise.progressionSettings.workSetsTarget),
    weightIncrement: formatNumber(exercise.progressionSettings.weightIncrement),
  }
}

function createRoutineDraftId(exerciseId: string): string {
  const token =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}`
  return `${exerciseId}:${token}`
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

function getRoutineCardState(index: number, activeIndex: number): RoutineCardState {
  if (activeIndex < 0) {
    return 'upcoming'
  }

  if (index === activeIndex) {
    return 'active'
  }

  if (index < activeIndex) {
    return 'completed'
  }

  return 'upcoming'
}

function getDayButtonClassName(state: RoutineCardState): string {
  if (state === 'active') {
    return 'day-button day-button--active'
  }

  if (state === 'completed') {
    return 'day-button day-button--completed'
  }

  return 'day-button day-button--upcoming'
}

function getDayBadgeClassName(state: RoutineCardState): string {
  if (state === 'active') {
    return 'day-button__badge day-button__badge--active'
  }

  if (state === 'completed') {
    return 'day-button__badge day-button__badge--completed'
  }

  return 'day-button__badge day-button__badge--upcoming'
}

function getRoutineDayNumber(routineName: string, index: number): string {
  const matched = routineName.match(/day\s*(\d+)/i)
  return matched?.[1] ?? String(index + 1)
}

function formatSplitHeaderLabel(label: string): string {
  return label
    .replace(/^(\d)\s+day/i, '$1-Day')
    .replace('split', 'Split')
    .toUpperCase()
}

function formatSplitOptionLabel(splitId: RoutineSplitId): string {
  return splitId === '4-day-split' ? '4 day' : '3 day'
}

function buildDayHeading(
  routineName: string | undefined,
  selectedRoutineIndex: number,
): { dayLabel: string; title: string } {
  if (!routineName) {
    const fallbackIndex = Math.max(1, selectedRoutineIndex + 1)
    return {
      dayLabel: `DAY ${fallbackIndex}`,
      title: `Day ${fallbackIndex}`,
    }
  }

  const dayNumber = getRoutineDayNumber(routineName, selectedRoutineIndex)
  const titleSource = routineName.replace(/^day\s*\d+\s*[–-]\s*/i, '').trim() || routineName
  const title = titleSource.replace(/\s*\/\s*/g, ' · ')

  return {
    dayLabel: `DAY ${dayNumber}`,
    title,
  }
}

function getRoutineFocusLabel(routineName: string | undefined): string {
  if (!routineName) {
    return 'WORKING SET'
  }

  const source = routineName.replace(/^day\s*\d+\s*[–-]\s*/i, '').trim() || routineName
  const normalized = source.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.toUpperCase() : 'WORKING SET'
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
