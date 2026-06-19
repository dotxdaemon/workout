// ABOUTME: Training screen with a fast Today logging flow and a separate routine Edit flow.
// ABOUTME: Logs sets, surfaces progression guidance and history, and keeps admin out of logging.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addSetEntry,
  assignRoutineToSession,
  createExercise,
  createRoutine,
  deleteRoutine,
  deleteSessionSet,
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
import { formatNumber } from '../lib/format'
import { parseNumber, parseReps } from '../lib/numberInput'
import { buildProgressionSuggestion } from '../lib/progression'
import { readPreferences } from '../lib/preferences'
import {
  readActiveRoutineSplitId,
  readSelectedRoutineId,
  writeActiveRoutineSplitId,
  writeSelectedRoutineId,
} from '../lib/routineSelection'
import { routineSplitOptions } from '../lib/routineSplit'
import type { Exercise, Routine, RoutineSplitId, SessionRecord, SetEntry, Unit } from '../types'
import { Banner } from '../components/Banner'
import { BottomSheet } from '../components/BottomSheet'
import { EmptyState } from '../components/EmptyState'
import { NumberField } from '../components/NumberField'
import { SegmentedControl } from '../components/SegmentedControl'
import { useCountdown } from '../components/useCountdown'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DumbbellIcon,
  GripIcon,
  InboxIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
  TrendUpIcon,
} from '../components/icons'

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
  openedAt: number
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
const historyPreviewLimit = 5

export function RoutinesScreen() {
  const historyRequestRef = useRef(0)
  const savedFeedbackTimeoutRef = useRef<number | null>(null)
  const hydratedRoutineIdRef = useRef<string | null>(null)

  const restTimer = useCountdown()

  const [isLoading, setIsLoading] = useState(true)
  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [historyPreviewByExercise, setHistoryPreviewByExercise] = useState<
    Record<string, HistoryItem[]>
  >({})
  const [activeSplitId, setActiveSplitId] = useState<RoutineSplitId>(() => readActiveRoutineSplitId())
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [mode, setMode] = useState<ScreenMode>('today')
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [draftsByExercise, setDraftsByExercise] = useState<Record<string, SetDraft>>({})
  const [notesByExercise, setNotesByExercise] = useState<Record<string, string>>({})
  const [historySheet, setHistorySheet] = useState<HistorySheetState | null>(null)
  const [restTimerExerciseId, setRestTimerExerciseId] = useState<string | null>(null)
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState(5)
  const [restTimerEnabled, setRestTimerEnabled] = useState(true)
  const [restSeconds, setRestSeconds] = useState(90)
  const [routineNameDraft, setRoutineNameDraft] = useState('')
  const [exerciseDrafts, setExerciseDrafts] = useState<RoutineExerciseDraft[]>([])
  const [openExerciseDraftIds, setOpenExerciseDraftIds] = useState<Record<string, boolean>>({})
  const [draftIdToReveal, setDraftIdToReveal] = useState<string | null>(null)
  const [todayExerciseIdToReveal, setTodayExerciseIdToReveal] = useState<string | null>(null)
  const [addExerciseName, setAddExerciseName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedExerciseId, setSavedExerciseId] = useState<string | null>(null)
  const [invalidEntryExerciseId, setInvalidEntryExerciseId] = useState<string | null>(null)

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

  const selectedExerciseIds = useMemo(() => selectedRoutine?.exerciseIds ?? [], [selectedRoutine])

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

  const trimmedAddExerciseName = addExerciseName.trim()
  const normalizedAddExerciseName = trimmedAddExerciseName.toLowerCase()
  const draftExerciseIds = useMemo(
    () => new Set(exerciseDrafts.map((draft) => draft.exerciseId)),
    [exerciseDrafts],
  )

  const editExerciseSuggestions = useMemo(() => {
    if (mode !== 'edit' || !trimmedAddExerciseName) {
      return []
    }
    return exercises
      .filter(
        (exercise) =>
          !draftExerciseIds.has(exercise.id) &&
          exercise.name.toLowerCase().includes(normalizedAddExerciseName),
      )
      .slice(0, 6)
  }, [draftExerciseIds, exercises, mode, normalizedAddExerciseName, trimmedAddExerciseName])

  function resetPageScrollToTop(): void {
    const screenArea = document.querySelector<HTMLElement>('.screen-area')
    if (screenArea) {
      screenArea.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return
    }
    const scrollingElement = document.scrollingElement ?? document.documentElement
    scrollingElement.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

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
    setDefaultWeightIncrement(preferences.defaultWeightIncrement)
    setRestTimerEnabled(preferences.restTimerEnabled)
    setRestSeconds(preferences.restSeconds)
    setError('')
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void loadData().catch(() => {
      setIsLoading(false)
      setError('Could not load your training data.')
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
      setError('Could not associate this routine with the current session.')
    })
  }, [selectedRoutine?.id, trackerSessionId])

  useEffect(() => {
    if (selectedExerciseIds.length === 0) {
      setHistoryPreviewByExercise({})
      return
    }

    let isCurrent = true

    void Promise.all(
      selectedExerciseIds.map(async (exerciseId) => {
        const rows = await listExerciseHistory(exerciseId, historyPreviewLimit)
        return [exerciseId, rows] as const
      }),
    )
      .then((pairs) => {
        if (isCurrent) {
          setHistoryPreviewByExercise(Object.fromEntries(pairs))
        }
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
    if (!trackerSessionId || !selectedRoutine) {
      setNotesByExercise({})
      return
    }
    const next: Record<string, string> = {}
    for (const exerciseId of selectedRoutine.exerciseIds) {
      next[exerciseId] = localStorage.getItem(noteStorageKey(trackerSessionId, exerciseId)) ?? ''
    }
    setNotesByExercise(next)
  }, [selectedRoutine, trackerSessionId])

  useEffect(() => {
    if (!selectedRoutine) {
      hydratedRoutineIdRef.current = null
      return
    }
    if (mode !== 'edit') {
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
    setOpenExerciseDraftIds({})
  }, [mode, selectedRoutine?.id])

  useEffect(() => {
    if (!draftIdToReveal) {
      return
    }
    const row = document.querySelector<HTMLElement>(
      `[data-draft-id="${cssAttrEscape(draftIdToReveal)}"]`,
    )
    row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setDraftIdToReveal(null)
  }, [draftIdToReveal, exerciseDrafts])

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

  useEffect(() => {
    if (mode !== 'today' || !todayExerciseIdToReveal) {
      return
    }
    const card = document.querySelector<HTMLElement>(
      `[data-exercise-id="${cssAttrEscape(todayExerciseIdToReveal)}"]`,
    )
    if (!card) {
      return
    }
    const frameId = window.requestAnimationFrame(() => {
      card.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      setTodayExerciseIdToReveal(null)
    })
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [mode, selectedExerciseIds, todayExerciseIdToReveal])

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

  function derivePrefill(exerciseId: string): SetDraft {
    const todaySets = setsByExercise[exerciseId] ?? []
    const lastToday = [...todaySets].reverse().find((set) => !set.isWarmup)
    if (lastToday) {
      return toDraft(lastToday)
    }
    const lastSession = historyPreviewByExercise[exerciseId]?.[0]
    const lastWorkSet = lastSession
      ? [...lastSession.sets].reverse().find((set) => !set.isWarmup)
      : undefined
    return lastWorkSet ? toDraft(lastWorkSet) : { weight: '', reps: '' }
  }

  function effectiveDraft(exerciseId: string): SetDraft {
    return draftsByExercise[exerciseId] ?? derivePrefill(exerciseId)
  }

  function setDraftField(exerciseId: string, field: keyof SetDraft, value: string): void {
    setInvalidEntryExerciseId((current) => (current === exerciseId ? null : current))
    setDraftsByExercise((current) => {
      const base = current[exerciseId] ?? derivePrefill(exerciseId)
      return { ...current, [exerciseId]: { ...base, [field]: value } }
    })
  }

  function clearDraft(exerciseId: string): void {
    setDraftsByExercise((current) => {
      if (!(exerciseId in current)) {
        return current
      }
      const next = { ...current }
      delete next[exerciseId]
      return next
    })
  }

  async function refreshHistoryForExercise(exerciseId: string): Promise<void> {
    const rows = await listExerciseHistory(exerciseId, historyPreviewLimit)
    setHistoryPreviewByExercise((current) => ({ ...current, [exerciseId]: rows }))
  }

  async function handleSaveSet(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }
    const draft = effectiveDraft(exerciseId)
    const weight = parseNumber(draft.weight)
    const reps = parseReps(draft.reps)

    if (weight <= 0 || reps <= 0) {
      setError('Enter both weight and reps before saving.')
      setInvalidEntryExerciseId(exerciseId)
      resetPageScrollToTop()
      return
    }

    try {
      const entry = await addSetEntry(trackerSessionId, exerciseId, { weight, reps, completed: true })
      setSetsByExercise((current) => ({
        ...current,
        [exerciseId]: [...(current[exerciseId] ?? []), entry],
      }))
      setInvalidEntryExerciseId((current) => (current === exerciseId ? null : current))
      clearDraft(exerciseId)
      await refreshHistoryForExercise(exerciseId)
      setError('')
      showSavedFeedback(exerciseId)
      startRestTimer(exerciseId)
    } catch {
      setError('Could not save the set.')
    }
  }

  async function handleRemoveSet(exerciseId: string, setId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }
    try {
      await deleteSessionSet(trackerSessionId, exerciseId, setId)
      const entries = await listSessionExerciseEntries(trackerSessionId, exerciseId)
      setSetsByExercise((current) => ({ ...current, [exerciseId]: entries }))
      clearDraft(exerciseId)
      await refreshHistoryForExercise(exerciseId)
      setError('')
    } catch {
      setError('Could not remove the set.')
    }
  }

  async function handleRepeatLastSession(exerciseId: string): Promise<void> {
    if (!trackerSessionId) {
      return
    }
    const lastSession = historyPreviewByExercise[exerciseId]?.[0]
    const workSets = (lastSession?.sets ?? []).filter((set) => !set.isWarmup)
    if (workSets.length === 0) {
      return
    }
    try {
      for (const set of workSets) {
        await addSetEntry(trackerSessionId, exerciseId, {
          weight: set.weight,
          reps: set.reps,
          completed: true,
        })
      }
      const entries = await listSessionExerciseEntries(trackerSessionId, exerciseId)
      setSetsByExercise((current) => ({ ...current, [exerciseId]: entries }))
      clearDraft(exerciseId)
      await refreshHistoryForExercise(exerciseId)
      setError('')
      showSavedFeedback(exerciseId)
    } catch {
      setError('Could not repeat the last session.')
    }
  }

  function startRestTimer(exerciseId: string): void {
    if (!restTimerEnabled || restSeconds <= 0) {
      return
    }
    setRestTimerExerciseId(exerciseId)
    restTimer.start(restSeconds)
  }

  function stopRestTimer(): void {
    restTimer.stop()
    setRestTimerExerciseId(null)
  }

  function handleNoteChange(exerciseId: string, value: string): void {
    setNotesByExercise((current) => ({ ...current, [exerciseId]: value }))
    if (trackerSessionId) {
      localStorage.setItem(noteStorageKey(trackerSessionId, exerciseId), value)
    }
  }

  async function handleOpenHistorySheet(exercise: Exercise, openedAt: number): Promise<void> {
    setHistorySheet({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      rows: historyPreviewByExercise[exercise.id] ?? [],
      isLoading: true,
      openedAt,
    })

    const requestId = historyRequestRef.current + 1
    historyRequestRef.current = requestId

    try {
      const rows = await listExerciseHistory(exercise.id)
      if (historyRequestRef.current !== requestId) {
        return
      }
      setHistorySheet((current) =>
        current && current.exerciseId === exercise.id ? { ...current, rows, isLoading: false } : current,
      )
    } catch {
      if (historyRequestRef.current !== requestId) {
        return
      }
      setError('Could not load exercise history.')
      setHistorySheet((current) => (current ? { ...current, rows: [], isLoading: false } : current))
    }
  }

  function closeHistorySheet(): void {
    historyRequestRef.current += 1
    setHistorySheet(null)
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
    if (!trimmedAddExerciseName) {
      return
    }
    const exactMatch = exercises.find((item) => item.name.toLowerCase() === normalizedAddExerciseName)
    if (exactMatch) {
      addExerciseDraft(exactMatch)
      return
    }

    const created = await createExercise({ name: trimmedAddExerciseName, unitDefault: defaultUnit })
    const createdExercise: Exercise = {
      ...created,
      progressionSettings: { ...created.progressionSettings, weightIncrement: defaultWeightIncrement },
    }
    await updateExercise(createdExercise.id, { progressionSettings: createdExercise.progressionSettings })
    setExercises((current) => sortExercisesByName([...current, createdExercise]))
    addExerciseDraft(createdExercise)
  }

  function addExerciseDraft(exercise: Exercise): void {
    const existingDraft = exerciseDrafts.find((draft) => draft.exerciseId === exercise.id)
    if (existingDraft) {
      setDraftIdToReveal(existingDraft.draftId)
      setAddExerciseName('')
      setMessage('That exercise is already in this routine.')
      setError('')
      return
    }
    const draftId = createRoutineDraftId(exercise.id)
    setExerciseDrafts((current) => [...current, toRoutineExerciseDraft(exercise, draftId)])
    setDraftIdToReveal(draftId)
    setAddExerciseName('')
    setMessage('Exercise added. Save the routine to apply changes.')
    setError('')
  }

  function toggleExerciseDraftDetails(draftId: string): void {
    setOpenExerciseDraftIds((current) => ({ ...current, [draftId]: !current[draftId] }))
  }

  function removeExerciseDraft(draftId: string): void {
    setExerciseDrafts((current) => current.filter((item) => item.draftId !== draftId))
    setOpenExerciseDraftIds((current) => {
      const next = { ...current }
      delete next[draftId]
      return next
    })
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

  function updateExerciseDraft(
    draftId: string,
    updater: (current: RoutineExerciseDraft) => RoutineExerciseDraft,
  ): void {
    setExerciseDrafts((current) =>
      current.map((item) => (item.draftId === draftId ? updater(item) : item)),
    )
  }

  async function handleSaveRoutineEdits(): Promise<void> {
    if (!selectedRoutine) {
      return
    }
    const routineName = routineNameDraft.trim()
    if (!routineName) {
      setError('Routine name is required.')
      resetPageScrollToTop()
      return
    }

    const sanitized = exerciseDrafts.map((draft) => {
      const repMin = Math.max(1, Math.round(Number(draft.repMin) || 1))
      const repMax = Math.max(repMin, Math.round(Number(draft.repMax) || repMin))
      const workSetsTarget = Math.max(1, Math.round(Number(draft.workSetsTarget) || 1))
      const weightIncrement = Math.max(0.1, Number(draft.weightIncrement) || 0.1)
      return { ...draft, name: draft.name.trim(), repMin, repMax, workSetsTarget, weightIncrement }
    })

    if (sanitized.some((draft) => !draft.name)) {
      setError('Exercise names cannot be blank.')
      resetPageScrollToTop()
      return
    }

    const nextExerciseIds: string[] = []
    const createdExercises: Exercise[] = []
    const currentExerciseIds = new Set(selectedRoutine.exerciseIds)

    for (const draft of sanitized) {
      const currentExercise = exerciseMap[draft.exerciseId]
      if (!currentExercise) {
        nextExerciseIds.push(draft.exerciseId)
        continue
      }

      const normalizedDraftName = draft.name.trim().toLowerCase()
      const normalizedExerciseName = currentExercise.name.trim().toLowerCase()

      if (normalizedDraftName !== normalizedExerciseName) {
        const createdExercise = await createExercise({ name: draft.name, unitDefault: draft.unit })
        const progressionSettings = {
          ...currentExercise.progressionSettings,
          unit: draft.unit,
          repMin: draft.repMin,
          repMax: draft.repMax,
          workSetsTarget: draft.workSetsTarget,
          weightIncrement: draft.weightIncrement,
        }
        await updateExercise(createdExercise.id, { progressionSettings, unitDefault: draft.unit })
        createdExercises.push({ ...createdExercise, progressionSettings, unitDefault: draft.unit })
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
      setExercises((current) => sortExercisesByName([...current, ...createdExercises]))
    }

    await updateRoutine(selectedRoutine.id, { name: routineName, exerciseIds: nextExerciseIds })

    const exerciseIdToReveal =
      nextExerciseIds.find((exerciseId) => !currentExerciseIds.has(exerciseId)) ?? null
    if (exerciseIdToReveal) {
      setTodayExerciseIdToReveal(exerciseIdToReveal)
    }

    hydratedRoutineIdRef.current = null
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
      setError('Keep at least one routine in this split.')
      return
    }
    if (!window.confirm(`Delete ${selectedRoutine.name}? This cannot be undone.`)) {
      return
    }

    await deleteRoutine(selectedRoutine.id)
    const remaining = routines.filter((routine) => routine.id !== selectedRoutine.id)
    const remainingInSplit = remaining.filter((routine) => routine.splitId === activeSplit.id)
    hydratedRoutineIdRef.current = null
    setRoutines(remaining)
    setSelectedRoutineId(remainingInSplit[0]?.id ?? '')
    setMode('today')
    setMessage(`${selectedRoutine.name} deleted.`)
    setError('')
  }

  return (
    <section className="page">
      <header className="train-header">
        <div className="train-header__top">
          <div>
            <p className="eyebrow eyebrow--jade">{formatSplitHeaderLabel(activeSplit.label)}</p>
            <h1 className="page-title">Train</h1>
          </div>
          <SegmentedControl
            ariaLabel="Training mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'edit', label: 'Edit' },
            ]}
          />
        </div>
        {mode === 'today' && orderedRoutines.length > 1 ? (
          <div className="day-chips" role="tablist" aria-label="Select training day">
            {orderedRoutines.map((routine, index) => {
              const isActive = routine.id === selectedRoutine?.id
              return (
                <button
                  key={routine.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={isActive ? 'day-chip day-chip--active' : 'day-chip'}
                  onClick={() => setSelectedRoutineId(routine.id)}
                >
                  <span className="day-chip__index numeral">
                    {getRoutineDayNumber(routine.name, index)}
                  </span>
                  <span className="day-chip__name">{routine.name}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </header>

      {message ? <Banner tone="success">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {isLoading ? (
        <div className="exercise-list" aria-hidden="true">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      ) : mode === 'today' ? (
        <div className="train-today stack">
          <header className="active-day">
            <div className="active-day__meta">
              <p className="eyebrow eyebrow--jade">{dayHeading.dayLabel}</p>
              <p className="muted">
                {selectedRoutine ? `${selectedExerciseIds.length} exercises` : '0 exercises'}
              </p>
            </div>
            <h2 className="active-day__title">{dayHeading.title}</h2>
          </header>

          {selectedRoutine && selectedExerciseIds.length > 0 ? (
            <div className="exercise-list">
              {selectedExerciseIds.map((exerciseId) => {
                const exercise = exerciseMap[exerciseId]
                if (!exercise) {
                  return null
                }
                return (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    groupLabel={routineFocusLabel}
                    isExpanded={expandedExerciseId === exercise.id}
                    onToggle={() =>
                      setExpandedExerciseId((current) =>
                        current === exercise.id ? null : exercise.id,
                      )
                    }
                    todaySets={setsByExercise[exercise.id] ?? []}
                    lastSession={historyPreviewByExercise[exercise.id]?.[0]}
                    draft={effectiveDraft(exercise.id)}
                    weightStep={exercise.progressionSettings.weightIncrement}
                    isSaved={savedExerciseId === exercise.id}
                    invalidEntry={invalidEntryExerciseId === exercise.id}
                    note={notesByExercise[exercise.id] ?? ''}
                    restSecondsLeft={restTimerExerciseId === exercise.id ? restTimer.secondsLeft : 0}
                    onWeightChange={(value) => setDraftField(exercise.id, 'weight', value)}
                    onRepsChange={(value) => setDraftField(exercise.id, 'reps', value)}
                    onSave={() => void handleSaveSet(exercise.id)}
                    onRemoveSet={(setId) => void handleRemoveSet(exercise.id, setId)}
                    onRepeatLast={() => void handleRepeatLastSession(exercise.id)}
                    onOpenHistory={(openedAt) => void handleOpenHistorySheet(exercise, openedAt)}
                    onNoteChange={(value) => handleNoteChange(exercise.id, value)}
                    onStopRest={stopRestTimer}
                  />
                )
              })}
            </div>
          ) : selectedRoutine ? (
            <EmptyState
              glyph={<DumbbellIcon width={38} height={38} />}
              title="No exercises in this day yet"
              body="Switch to Edit to add exercises, then come back here to log your sets."
              action={
                <button type="button" className="btn btn--primary" onClick={() => setMode('edit')}>
                  Edit this routine
                </button>
              }
            />
          ) : (
            <EmptyState
              glyph={<DumbbellIcon width={38} height={38} />}
              title="No routines yet"
              body="Create a routine in Edit mode to start logging your workouts."
              action={
                <button type="button" className="btn btn--primary" onClick={() => void handleCreateRoutine()}>
                  Create a routine
                </button>
              }
            />
          )}
        </div>
      ) : (
        <EditMode
          activeSplitId={activeSplit.id}
          orderedRoutines={orderedRoutines}
          selectedRoutineIndex={selectedRoutineIndex}
          routineNameDraft={routineNameDraft}
          exerciseDrafts={exerciseDrafts}
          openExerciseDraftIds={openExerciseDraftIds}
          addExerciseName={addExerciseName}
          editExerciseSuggestions={editExerciseSuggestions}
          onSelectSplit={setActiveSplitId}
          onSelectRoutine={setSelectedRoutineId}
          onCreateRoutine={() => void handleCreateRoutine()}
          onRoutineNameChange={setRoutineNameDraft}
          onAddExerciseNameChange={setAddExerciseName}
          onAddExercise={() => void handleAddExerciseToDraft()}
          onAddSuggestion={addExerciseDraft}
          onToggleAdvanced={toggleExerciseDraftDetails}
          onMoveDraft={moveExerciseDraft}
          onRemoveDraft={removeExerciseDraft}
          onUpdateDraft={updateExerciseDraft}
          onSave={() => void handleSaveRoutineEdits()}
          onDelete={() => void handleDeleteRoutine()}
        />
      )}

      {historySheet ? (
        <BottomSheet
          eyebrow="History"
          title={historySheet.exerciseName}
          openedAt={historySheet.openedAt}
          onClose={closeHistorySheet}
        >
          <HistorySheetBody historySheet={historySheet} />
        </BottomSheet>
      ) : null}
    </section>
  )
}

/* ---------------- Exercise card ---------------- */

interface ExerciseCardProps {
  exercise: Exercise
  groupLabel: string
  isExpanded: boolean
  onToggle: () => void
  todaySets: SetEntry[]
  lastSession: HistoryItem | undefined
  draft: SetDraft
  weightStep: number
  isSaved: boolean
  invalidEntry: boolean
  note: string
  restSecondsLeft: number
  onWeightChange: (value: string) => void
  onRepsChange: (value: string) => void
  onSave: () => void
  onRemoveSet: (setId: string) => void
  onRepeatLast: () => void
  onOpenHistory: (openedAt: number) => void
  onNoteChange: (value: string) => void
  onStopRest: () => void
}

function ExerciseCard(props: ExerciseCardProps) {
  const { exercise, todaySets, lastSession } = props
  const unit = exercise.progressionSettings.unit
  const workSets = todaySets.filter((set) => !set.isWarmup)
  const topToday = getTopWorkSet(todaySets)
  const lastSummary = formatLastSummary(lastSession?.sets, unit)
  const suggestion = buildProgressionSuggestion(exercise.progressionSettings, todaySets)
  const hasHistory = (lastSession?.sets.filter((set) => !set.isWarmup).length ?? 0) > 0

  return (
    <article
      data-exercise-id={exercise.id}
      className={props.isExpanded ? 'exercise-card exercise-card--active' : 'exercise-card'}
    >
      <div className="exercise-card__head">
        <button
          type="button"
          className="exercise-card__title-btn"
          aria-expanded={props.isExpanded}
          aria-controls={`exercise-${exercise.id}-details`}
          onClick={props.onToggle}
        >
          <span className="exercise-card__group">{props.groupLabel}</span>
          <span className="exercise-card__name">
            {exercise.name}
            <ChevronDownIcon className="exercise-card__chevron" width={18} height={18} />
          </span>
        </button>
        <div className="exercise-card__head-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Open history for ${exercise.name}`}
            onClick={(event) => props.onOpenHistory(event.timeStamp)}
          >
            <ClockIcon />
          </button>
        </div>
      </div>

      <p className="last-line">
        <span className="eyebrow">Last</span>
        <span className="last-line__value">{lastSummary}</span>
      </p>

      <div className="set-track" aria-label="Sets logged today">
        <span className="set-track__label">Today</span>
        {workSets.length === 0 ? (
          <span className="set-track__empty">No sets yet</span>
        ) : (
          workSets.map((set, index) => (
            <span
              key={set.id}
              className={topToday?.id === set.id ? 'set-pill set-pill--top' : 'set-pill'}
            >
              <span className="set-pill__num">{index + 1}</span>
              <span>
                {formatNumber(set.weight)}
                <span className="set-pill__x"> × </span>
                {set.reps}
              </span>
              <button
                type="button"
                className="set-pill__remove"
                aria-label={`Remove set ${index + 1} (${formatNumber(set.weight)} ${unit} by ${set.reps} reps)`}
                onClick={() => props.onRemoveSet(set.id)}
              >
                <CloseIcon width={13} height={13} />
              </button>
            </span>
          ))
        )}
      </div>

      {props.restSecondsLeft > 0 ? (
        <div className="rest-timer">
          <span className="rest-timer__dot" aria-hidden="true" />
          <span className="rest-timer__label">Rest</span>
          <span className="rest-timer__time numeral" aria-label={`${props.restSecondsLeft} seconds rest remaining`}>
            {formatClock(props.restSecondsLeft)}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--small rest-timer__skip"
            onClick={props.onStopRest}
            aria-label="Skip rest timer"
          >
            Skip
          </button>
        </div>
      ) : null}

      <div className="quick-entry">
        <div className="quick-entry__fields">
          <NumberField
            label="Weight"
            ariaLabel={`${exercise.name} weight`}
            value={props.draft.weight}
            step={props.weightStep}
            invalid={props.invalidEntry}
            onValueChange={props.onWeightChange}
          />
          <NumberField
            label="Reps"
            ariaLabel={`${exercise.name} reps`}
            value={props.draft.reps}
            step={1}
            integer
            invalid={props.invalidEntry}
            onValueChange={props.onRepsChange}
          />
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block quick-entry__save"
          onClick={props.onSave}
        >
          {props.isSaved ? 'Saved' : 'Save set'}
        </button>
      </div>

      {suggestion && (suggestion.kind === 'increase_weight' || suggestion.kind === 'add_reps') ? (
        <p
          className={
            suggestion.kind === 'increase_weight' ? 'suggestion suggestion--increase' : 'suggestion suggestion--reps'
          }
        >
          {suggestion.kind === 'increase_weight' ? (
            <TrendUpIcon className="suggestion__icon" />
          ) : (
            <RepeatIcon className="suggestion__icon" />
          )}
          <span>{suggestion.message}</span>
        </p>
      ) : null}

      {props.isExpanded ? (
        <div className="exercise-card__expanded" id={`exercise-${exercise.id}-details`}>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={props.onRepeatLast}
            disabled={!hasHistory || workSets.length > 0}
          >
            <RepeatIcon width={17} height={17} />
            Repeat last session
          </button>
          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="notes-input"
              value={props.note}
              rows={2}
              onChange={(event) => props.onNoteChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </article>
  )
}

/* ---------------- History sheet body ---------------- */

function HistorySheetBody({ historySheet }: { historySheet: HistorySheetState }) {
  if (historySheet.rows.length === 0) {
    if (historySheet.isLoading) {
      return (
        <div className="stack">
          <div className="skeleton" style={{ height: '76px' }} />
          <div className="skeleton" style={{ height: '76px' }} />
        </div>
      )
    }
    return (
      <EmptyState
        glyph={<InboxIcon width={38} height={38} />}
        title="No history yet"
        body="Log a set and it will show up here."
      />
    )
  }

  return (
    <>
      {historySheet.rows.map((row) => {
        const timestamp = getHistoryTimestamp(row.session, row.sets)
        const workSets = row.sets.filter((set) => !set.isWarmup)
        const topSet = getTopWorkSet(row.sets)
        const totalReps = workSets.reduce((sum, set) => sum + set.reps, 0)

        return (
          <article key={row.session.id} className="history-row">
            <header className="history-row__head">
              <span className="history-row__date">{formatHistoryDate(timestamp)}</span>
              {topSet ? (
                <span className="history-row__top">
                  <span className="history-row__top-label">Top</span>
                  <span className="history-row__top-value">
                    {formatNumber(topSet.weight)} × {topSet.reps}
                  </span>
                </span>
              ) : null}
            </header>
            {workSets.length > 0 ? (
              <div className="history-row__chips">
                {workSets.map((set) => (
                  <span
                    key={set.id}
                    className={topSet?.id === set.id ? 'set-pill set-pill--top' : 'set-pill'}
                  >
                    <span>
                      {formatNumber(set.weight)}
                      <span className="set-pill__x"> × </span>
                      {set.reps}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No work sets recorded.</p>
            )}
            {workSets.length > 0 ? (
              <footer className="history-row__footer">
                <span>
                  {workSets.length} {workSets.length === 1 ? 'set' : 'sets'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{totalReps} total reps</span>
              </footer>
            ) : null}
          </article>
        )
      })}
    </>
  )
}

/* ---------------- Edit mode ---------------- */

type RoutineCardState = 'active' | 'completed' | 'upcoming'

interface EditModeProps {
  activeSplitId: RoutineSplitId
  orderedRoutines: Routine[]
  selectedRoutineIndex: number
  routineNameDraft: string
  exerciseDrafts: RoutineExerciseDraft[]
  openExerciseDraftIds: Record<string, boolean>
  addExerciseName: string
  editExerciseSuggestions: Exercise[]
  onSelectSplit: (splitId: RoutineSplitId) => void
  onSelectRoutine: (routineId: string) => void
  onCreateRoutine: () => void
  onRoutineNameChange: (value: string) => void
  onAddExerciseNameChange: (value: string) => void
  onAddExercise: () => void
  onAddSuggestion: (exercise: Exercise) => void
  onToggleAdvanced: (draftId: string) => void
  onMoveDraft: (draftId: string, direction: -1 | 1) => void
  onRemoveDraft: (draftId: string) => void
  onUpdateDraft: (
    draftId: string,
    updater: (current: RoutineExerciseDraft) => RoutineExerciseDraft,
  ) => void
  onSave: () => void
  onDelete: () => void
}

function EditMode(props: EditModeProps) {
  return (
    <div className="edit-mode">
      <div className="panel">
        <div className="split-row">
          <span className="field__label">Split</span>
          <SegmentedControl
            ariaLabel="Routine split"
            value={props.activeSplitId}
            onChange={props.onSelectSplit}
            options={routineSplitOptions.map((split) => ({
              value: split.id,
              label: formatSplitOptionLabel(split.id),
            }))}
          />
        </div>
        <hr className="hairline" />
        <div className="day-picker">
          {props.orderedRoutines.map((routine, index) => {
            const state = getRoutineCardState(index, props.selectedRoutineIndex)
            return (
              <button
                key={routine.id}
                type="button"
                className={dayRowClassName(state)}
                aria-current={state === 'active'}
                onClick={() => props.onSelectRoutine(routine.id)}
              >
                <span className="day-row__badge">
                  {state === 'completed' ? '✓' : getRoutineDayNumber(routine.name, index)}
                </span>
                <span className="day-row__content">
                  <span className="day-row__name">{routine.name}</span>
                  <span className="day-row__meta">
                    <span>{routine.exerciseIds.length} exercises</span>
                    {state === 'active' ? (
                      <span className="day-row__tag day-row__tag--today">Selected</span>
                    ) : null}
                  </span>
                </span>
                <ChevronRightIcon className="day-row__chevron" width={18} height={18} />
              </button>
            )
          })}
        </div>
        <button type="button" className="btn btn--dashed btn--block" onClick={props.onCreateRoutine}>
          <PlusIcon width={16} height={16} />
          Create routine
        </button>
      </div>

      <div className="panel">
        <h2 className="panel__title">Edit routine</h2>

        <label className="field">
          <span className="field__label">Routine name</span>
          <input
            value={props.routineNameDraft}
            onChange={(event) => props.onRoutineNameChange(event.target.value)}
          />
        </label>

        <div className="add-row">
          <input
            value={props.addExerciseName}
            onChange={(event) => props.onAddExerciseNameChange(event.target.value)}
            placeholder="Add exercise"
            aria-label="Add exercise"
            aria-describedby="add-exercise-hint"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                props.onAddExercise()
              }
            }}
          />
          <button type="button" className="btn btn--small" onClick={props.onAddExercise}>
            Add
          </button>
        </div>
        <p id="add-exercise-hint" className="visually-hidden">
          Type a name and press Enter, or choose a matching exercise from the suggestions that appear
          below. New exercises are added when you save the routine.
        </p>

        {props.editExerciseSuggestions.length > 0 ? (
          <div className="suggestions">
            {props.editExerciseSuggestions.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="suggestion-option"
                onClick={() => props.onAddSuggestion(exercise)}
              >
                {exercise.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="sticky-actions">
          <button type="button" className="btn btn--primary" onClick={props.onSave}>
            Save routine
          </button>
          <button type="button" className="btn btn--danger" onClick={props.onDelete}>
            Delete routine
          </button>
        </div>

        <div className="edit-exercise-list">
          {props.exerciseDrafts.map((draft, index) => {
            const isAdvancedOpen = Boolean(props.openExerciseDraftIds[draft.draftId])
            return (
              <article key={draft.draftId} data-draft-id={draft.draftId} className="edit-exercise">
                <div className="edit-exercise__head">
                  <div className="edit-exercise__title">
                    <GripIcon className="edit-exercise__handle" width={16} height={16} />
                    <h3 className="edit-exercise__name">{draft.name || 'Exercise'}</h3>
                  </div>
                  <div className="edit-exercise__actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => props.onToggleAdvanced(draft.draftId)}
                      aria-expanded={isAdvancedOpen}
                    >
                      Advanced
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => props.onMoveDraft(draft.draftId, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${draft.name || 'exercise'} up`}
                    >
                      <ArrowUpIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => props.onMoveDraft(draft.draftId, 1)}
                      disabled={index === props.exerciseDrafts.length - 1}
                      aria-label={`Move ${draft.name || 'exercise'} down`}
                    >
                      <ArrowDownIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={() => props.onRemoveDraft(draft.draftId)}
                      aria-label={`Remove ${draft.name || 'exercise'}`}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                </div>

                {isAdvancedOpen ? (
                  <div className="edit-exercise__advanced">
                    <label className="field">
                      <span className="field__label">Name</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          props.onUpdateDraft(draft.draftId, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="field-grid">
                      <label className="field">
                        <span className="field__label">Unit</span>
                        <select
                          value={draft.unit}
                          onChange={(event) =>
                            props.onUpdateDraft(draft.draftId, (current) => ({
                              ...current,
                              unit: event.target.value as Unit,
                            }))
                          }
                        >
                          <option value="lb">lb</option>
                          <option value="kg">kg</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field__label">Rep min</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={draft.repMin}
                          onChange={(event) =>
                            props.onUpdateDraft(draft.draftId, (current) => ({
                              ...current,
                              repMin: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Rep max</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={draft.repMax}
                          onChange={(event) =>
                            props.onUpdateDraft(draft.draftId, (current) => ({
                              ...current,
                              repMax: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Work sets</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={draft.workSetsTarget}
                          onChange={(event) =>
                            props.onUpdateDraft(draft.draftId, (current) => ({
                              ...current,
                              workSetsTarget: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Increment</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.1"
                          step="0.1"
                          value={draft.weightIncrement}
                          onChange={(event) =>
                            props.onUpdateDraft(draft.draftId, (current) => ({
                              ...current,
                              weightIncrement: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------- helpers ---------------- */

function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function toDraft(set: SetEntry): SetDraft {
  return {
    weight: set.weight > 0 ? formatNumber(set.weight) : '',
    reps: set.reps > 0 ? String(set.reps) : '',
  }
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
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}`
  return `${exerciseId}:${token}`
}

function sortExercisesByName(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((left, right) => left.name.localeCompare(right.name))
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

function dayRowClassName(state: RoutineCardState): string {
  if (state === 'active') {
    return 'day-row day-row--active'
  }
  if (state === 'completed') {
    return 'day-row day-row--completed'
  }
  return 'day-row'
}

function getRoutineDayNumber(routineName: string, index: number): string {
  const matched = routineName.match(/day\s*(\d+)/i)
  return matched?.[1] ?? String(index + 1)
}

function formatSplitHeaderLabel(label: string): string {
  return label.replace(/^(\d)\s+day/i, '$1-Day').replace('split', 'Split').toUpperCase()
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
    return { dayLabel: `DAY ${fallbackIndex}`, title: `Day ${fallbackIndex}` }
  }
  const dayNumber = getRoutineDayNumber(routineName, selectedRoutineIndex)
  const titleSource = routineName.replace(/^day\s*\d+\s*[–-]\s*/i, '').trim() || routineName
  const title = titleSource.replace(/\s*\/\s*/g, ' · ')
  return { dayLabel: `DAY ${dayNumber}`, title }
}

function getRoutineFocusLabel(routineName: string | undefined): string {
  if (!routineName) {
    return 'WORKING SET'
  }
  const source = routineName.replace(/^day\s*\d+\s*[–-]\s*/i, '').trim() || routineName
  const normalized = source.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.toUpperCase() : 'WORKING SET'
}

function formatLastSummary(lastSets: SetEntry[] | undefined, unit: Unit): string {
  if (!lastSets || lastSets.length === 0) {
    return 'No previous session'
  }
  const latestWorkSet = [...lastSets].reverse().find((set) => !set.isWarmup)
  if (!latestWorkSet) {
    return 'No previous session'
  }
  return `${formatNumber(latestWorkSet.weight)} ${unit} × ${latestWorkSet.reps}`
}

function getHistoryTimestamp(session: SessionRecord, sets: SetEntry[]): string {
  const completedAtValues = sets
    .map((set) => set.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))
  return completedAtValues[0] ?? session.endedAt ?? session.startedAt
}

function formatHistoryDate(value: string, now: Date = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }
  const startOfDay = (input: Date) => {
    const copy = new Date(input)
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getTopWorkSet(sets: SetEntry[]): SetEntry | null {
  const workSets = sets.filter((set) => !set.isWarmup)
  if (workSets.length === 0) {
    return null
  }
  return workSets.reduce((best, current) => {
    const bestScore = best.weight * (1 + best.reps / 30)
    const currentScore = current.weight * (1 + current.reps / 30)
    return currentScore > bestScore ? current : best
  })
}

function getNextRoutineName(routines: Routine[]): string {
  const names = new Set(routines.map((routine) => routine.name.toLowerCase()))
  let index = 1
  while (names.has(`routine ${index}`)) {
    index += 1
  }
  return `Routine ${index}`
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
