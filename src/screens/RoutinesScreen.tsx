// ABOUTME: Training screen with a fast Today logging flow and a separate routine Edit flow.
// ABOUTME: Logs sets, surfaces progression guidance and history, and keeps admin out of logging.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignRoutineToSession,
  endSession,
  getSession,
  getLastCompletedSessionForExercise,
  updateSessionExercises,
  db,
  createExercise,
  createRoutine,
  deleteRoutine,
  ensureCoreRoutines,
  getOrCreateTrackerSession,
  listExerciseHistory,
  listExercises,
  listRoutines,
  listSessionSetEntries,
  updateExercise,
  updateRoutine,
} from '../lib/db'
import { formatNumber } from '../lib/format'
import { readPreferences } from '../lib/preferences'
import {
  readActiveRoutineSplitId,
  readSelectedRoutineId,
  writeActiveRoutineSplitId,
  writeSelectedRoutineId,
} from '../lib/routineSelection'
import { routineSplitOptions } from '../lib/routineSplit'
import type {
  Exercise,
  Routine,
  RoutineSplitId,
  SessionRecord,
  SetEntry,
  Unit,
} from '../types'
import { Banner } from '../components/Banner'
import { BottomSheet } from '../components/BottomSheet'
import { WorkoutExercise } from '../components/WorkoutExercise'
import { ExerciseHistory } from '../components/ExerciseHistory'
import { SegmentedControl } from '../components/SegmentedControl'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GripIcon,
  PlusIcon,
  TrashIcon,
} from '../components/icons'

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
  loadError?: string
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
  const hydratedRoutineIdRef = useRef<string | null>(null)
  const dayChipsRef = useRef<HTMLDivElement | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [trackerSessionId, setTrackerSessionId] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [sessionPlan, setSessionPlan] = useState<string[] | undefined>()
  const [busyExercises, setBusyExercises] = useState<Record<string, boolean>>({})
  const [finishing, setFinishing] = useState(false)
  const finishLock = useRef(false)
  const planLock = useRef(false)
  const [isChangingPlan, setIsChangingPlan] = useState(false)
  const [workoutRoutineId, setWorkoutRoutineId] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetEntry[]>>({})
  const [historyPreviewByExercise, setHistoryPreviewByExercise] = useState<
    Record<string, HistoryItem[]>
  >({})
  const [activeSplitId, setActiveSplitId] = useState<RoutineSplitId>(() =>
    readActiveRoutineSplitId(),
  )
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [mode, setMode] = useState<ScreenMode>('today')
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const [historySheet, setHistorySheet] = useState<HistorySheetState | null>(null)
  const [defaultUnit, setDefaultUnit] = useState<Unit>('lb')
  const [defaultWeightIncrement, setDefaultWeightIncrement] = useState(5)
  const [routineNameDraft, setRoutineNameDraft] = useState('')
  const [exerciseDrafts, setExerciseDrafts] = useState<RoutineExerciseDraft[]>([])
  const [openExerciseDraftIds, setOpenExerciseDraftIds] = useState<
    Record<string, boolean>
  >({})
  const [draftIdToReveal, setDraftIdToReveal] = useState<string | null>(null)
  const [todayExerciseIdToReveal, setTodayExerciseIdToReveal] = useState<string | null>(
    null,
  )
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [addExerciseName, setAddExerciseName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  const activeSplit = useMemo(
    () =>
      routineSplitOptions.find((option) => option.id === activeSplitId) ??
      routineSplitOptions[0],
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
    () =>
      orderedRoutines.find((routine) => routine.id === selectedRoutineId) ??
      orderedRoutines[0],
    [orderedRoutines, selectedRoutineId],
  )

  const selectedExerciseIds = useMemo(
    () => selectedRoutine?.exerciseIds ?? [],
    [selectedRoutine],
  )

  const visibleExerciseIds = useMemo(
    () => sessionPlan ?? selectedExerciseIds,
    [sessionPlan, selectedExerciseIds],
  )
  const activeExerciseId =
    expandedExerciseId && visibleExerciseIds.includes(expandedExerciseId)
      ? expandedExerciseId
      : visibleExerciseIds[0]
  const isWriting = Object.values(busyExercises).some(Boolean)

  const selectedRoutineIndex = useMemo(
    () =>
      selectedRoutine
        ? orderedRoutines.findIndex((routine) => routine.id === selectedRoutine.id)
        : -1,
    [orderedRoutines, selectedRoutine],
  )

  const dayTitle = useMemo(
    () => buildDayTitle(selectedRoutine?.name, selectedRoutineIndex),
    [selectedRoutine?.name, selectedRoutineIndex],
  )

  const normalizedExerciseSearch = exerciseSearch.trim().toLowerCase()
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
  }, [
    draftExerciseIds,
    exercises,
    mode,
    normalizedAddExerciseName,
    trimmedAddExerciseName,
  ])

  const exerciseSearchResults = useMemo(() => {
    if (!normalizedExerciseSearch) {
      return []
    }
    return exercises
      .filter((exercise) =>
        exercise.name.toLowerCase().includes(normalizedExerciseSearch),
      )
      .slice(0, 6)
  }, [exercises, normalizedExerciseSearch])

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
    setStartedAt(trackerSession.startedAt)
    setSessionPlan(trackerSession.exerciseIds)
    setWorkoutRoutineId(trackerSession.routineId ?? '')
    const resumedRoutine = loadedRoutines.find(
      (routine) => routine.id === trackerSession.routineId,
    )
    if (resumedRoutine) {
      setActiveSplitId(resumedRoutine.splitId)
      setSelectedRoutineId(resumedRoutine.id)
    }
    setRoutines(loadedRoutines)
    setExercises(loadedExercises)
    setSetsByExercise(groupSetsByExercise(sessionSets))
    setDefaultUnit(preferences.defaultUnit)
    setDefaultWeightIncrement(preferences.defaultWeightIncrement)
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
    const selectedInSplit = orderedRoutines.find(
      (routine) => routine.id === selectedRoutineId,
    )
    if (selectedInSplit) {
      return
    }

    const storedRoutineId = readSelectedRoutineId(activeSplit.id)
    if (
      storedRoutineId &&
      orderedRoutines.some((routine) => routine.id === storedRoutineId)
    ) {
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
  }, [
    activeSplit.fallbackRoutineNames,
    activeSplit.id,
    orderedRoutines,
    selectedRoutineId,
  ])

  useEffect(() => {
    const selectedInSplit = orderedRoutines.some(
      (routine) => routine.id === selectedRoutineId,
    )
    if (!selectedInSplit) {
      return
    }
    writeSelectedRoutineId(activeSplit.id, selectedRoutineId)
  }, [activeSplit.id, orderedRoutines, selectedRoutineId])

  useEffect(() => {
    if (!trackerSessionId || !selectedRoutine?.id || sessionPlan !== undefined) return
    let current = true
    void assignRoutineToSession(trackerSessionId, selectedRoutine.id)
      .then(() => getSession(trackerSessionId))
      .then((session) => {
        if (current) {
          setSessionPlan(session?.exerciseIds)
          setWorkoutRoutineId(session?.routineId ?? '')
        }
      })
      .catch(() => setError('Could not save this workout plan.'))
    return () => {
      current = false
    }
  }, [selectedRoutine?.id, trackerSessionId, sessionPlan])

  useEffect(() => {
    if (visibleExerciseIds.length === 0) {
      setHistoryPreviewByExercise({})
      return
    }

    let isCurrent = true

    void Promise.all(
      visibleExerciseIds.map(async (exerciseId) => {
        const previous = await getLastCompletedSessionForExercise(exerciseId)
        return [exerciseId, previous ? [previous] : []] as const
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
  }, [visibleExerciseIds])

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
        .map((exercise) =>
          toRoutineExerciseDraft(exercise, createRoutineDraftId(exercise.id)),
        ),
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
  }, [mode, todayExerciseIdToReveal, visibleExerciseIds])

  useEffect(() => {
    if (mode !== 'today') {
      return
    }
    const container = dayChipsRef.current
    const active = container?.querySelector<HTMLElement>('.day-chip--active')
    if (!container || !active || typeof container.scrollTo !== 'function') {
      return
    }
    const target = active.offsetLeft - (container.clientWidth - active.clientWidth) / 2
    container.scrollTo({ left: Math.max(0, target) })
  }, [mode, selectedRoutine?.id, orderedRoutines.length])

  async function refreshHistoryForExercise(exerciseId: string): Promise<void> {
    const previous = await getLastCompletedSessionForExercise(exerciseId)
    const rows = previous ? [previous] : []
    setHistoryPreviewByExercise((current) => ({ ...current, [exerciseId]: rows }))
  }

  async function handleSelectSearchedExercise(exerciseId: string): Promise<void> {
    if (planLock.current || finishing) return
    planLock.current = true
    setIsChangingPlan(true)
    try {
      const ids = [...new Set([...visibleExerciseIds, exerciseId])]
      await updateSessionExercises(trackerSessionId, ids)
      setSessionPlan(ids)
      setExpandedExerciseId(exerciseId)
      setExerciseSearch('')
      setIsAddOpen(false)
      setTodayExerciseIdToReveal(exerciseId)
      setError('')
    } catch {
      setError('Could not add this exercise. Try again.')
    } finally {
      planLock.current = false
      setIsChangingPlan(false)
    }
  }

  async function handleCreateTodayExercise(): Promise<void> {
    if (!exerciseSearch.trim() || planLock.current) return
    planLock.current = true
    setIsChangingPlan(true)
    try {
      const exercise = await db.transaction('rw', db.exercises, db.sessions, async () => {
        const created = await createExercise({
          name: exerciseSearch.trim(),
          unitDefault: defaultUnit,
        })
        created.progressionSettings.weightIncrement = defaultWeightIncrement
        await updateExercise(created.id, {
          progressionSettings: created.progressionSettings,
        })
        await updateSessionExercises(trackerSessionId, [
          ...visibleExerciseIds,
          created.id,
        ])
        return created
      })
      setExercises((current) => sortExercisesByName([...current, exercise]))
      setSessionPlan([...visibleExerciseIds, exercise.id])
      setExpandedExerciseId(exercise.id)
      setExerciseSearch('')
      setIsAddOpen(false)
      setTodayExerciseIdToReveal(exercise.id)
      setError('')
    } catch {
      setError('Could not create this exercise. Try again.')
    } finally {
      planLock.current = false
      setIsChangingPlan(false)
    }
  }

  async function handleRemoveTodayExercise(exerciseId: string): Promise<void> {
    if (planLock.current || isWriting || finishing) return
    planLock.current = true
    setIsChangingPlan(true)
    try {
      const ids = visibleExerciseIds.filter((id) => id !== exerciseId)
      await updateSessionExercises(trackerSessionId, ids)
      setSessionPlan(ids)
      setError('')
    } catch {
      setError('Could not change the workout plan. Try again.')
    } finally {
      planLock.current = false
      setIsChangingPlan(false)
    }
  }

  async function handleChooseRoutine(routineId: string): Promise<void> {
    const routine = routines.find((item) => item.id === routineId)
    if (!routine || isWriting || finishing || planLock.current) return
    if (mode === 'edit') {
      setSelectedRoutineId(routineId)
      return
    }
    planLock.current = true
    setIsChangingPlan(true)
    try {
      await db.transaction(
        'rw',
        [db.sessions, db.routines, db.exercises, db.setEntries],
        async () => {
          await assignRoutineToSession(trackerSessionId, routineId)
          await updateSessionExercises(trackerSessionId, routine.exerciseIds)
        },
      )
      setSelectedRoutineId(routineId)
      setWorkoutRoutineId(routineId)
      setSessionPlan([...routine.exerciseIds])
      setExpandedExerciseId(routine.exerciseIds[0] ?? null)
      setError('')
    } catch {
      setError('Could not change this workout. Try again.')
    } finally {
      planLock.current = false
      setIsChangingPlan(false)
    }
  }

  async function handleFinishWorkout(): Promise<void> {
    if (finishLock.current || isWriting || planLock.current) return
    finishLock.current = true
    setFinishing(true)
    try {
      await endSession(trackerSessionId)
      setHistoryPreviewByExercise({})
      setExpandedExerciseId(null)
      await loadData()
      setMessage('Workout finished. Completed sets are saved on this device.')
    } catch {
      setError('Could not finish this workout. Your sets are still here. Try again.')
    } finally {
      finishLock.current = false
      setFinishing(false)
    }
  }

  async function handleOpenHistorySheet(
    exercise: Exercise,
    openedAt: number,
  ): Promise<void> {
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
        current && current.exerciseId === exercise.id
          ? { ...current, rows, isLoading: false }
          : current,
      )
    } catch {
      if (historyRequestRef.current !== requestId) {
        return
      }
      setHistorySheet((current) =>
        current
          ? {
              ...current,
              isLoading: false,
              loadError: 'Could not load history. Close and reopen history to retry.',
            }
          : current,
      )
    }
  }

  const closeHistorySheet = useCallback(() => {
    historyRequestRef.current += 1
    setHistorySheet(null)
  }, [])

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
    const matches = exercises.filter(
      (item) => item.name.toLowerCase() === normalizedAddExerciseName,
    )
    const exactMatch = matches.length === 1 ? matches[0] : undefined
    if (exactMatch) {
      addExerciseDraft(exactMatch)
      return
    }

    const created = await createExercise({
      name: trimmedAddExerciseName,
      unitDefault: defaultUnit,
    })
    const createdExercise: Exercise = {
      ...created,
      progressionSettings: {
        ...created.progressionSettings,
        weightIncrement: defaultWeightIncrement,
      },
    }
    await updateExercise(createdExercise.id, {
      progressionSettings: createdExercise.progressionSettings,
    })
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
    setExerciseDrafts((current) => [
      ...current,
      toRoutineExerciseDraft(exercise, draftId),
    ])
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
      resetPageScrollToTop()
      return
    }

    const nextExerciseIds: string[] = []
    const currentExerciseIds = new Set(selectedRoutine.exerciseIds)

    await db.transaction('rw', db.exercises, db.routines, async () => {
      for (const draft of sanitized) {
        const currentExercise = exerciseMap[draft.exerciseId]
        if (!currentExercise) {
          nextExerciseIds.push(draft.exerciseId)
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

      await updateRoutine(selectedRoutine.id, {
        name: routineName,
        exerciseIds: nextExerciseIds,
      })
    })

    const exerciseIdToReveal =
      nextExerciseIds.find((exerciseId) => !currentExerciseIds.has(exerciseId)) ?? null
    if (exerciseIdToReveal) {
      setTodayExerciseIdToReveal(exerciseIdToReveal)
    }

    hydratedRoutineIdRef.current = null
    setMode('today')
    setExpandedExerciseId(null)
    setMessage('Routine saved for future workouts.')
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
    const remainingInSplit = remaining.filter(
      (routine) => routine.splitId === activeSplit.id,
    )
    hydratedRoutineIdRef.current = null
    setRoutines(remaining)
    setSelectedRoutineId(remainingInSplit[0]?.id ?? '')
    setMode('today')
    setMessage(`${selectedRoutine.name} deleted.`)
    setError('')
  }

  return (
    <section className="page training-page">
      <header
        className={
          mode === 'today'
            ? 'training-console training-console--today'
            : 'training-console'
        }
      >
        <div className="training-console__top">
          {mode === 'edit' ? (
            <p className="eyebrow">{formatSplitHeaderLabel(activeSplit.label)}</p>
          ) : null}
          <SegmentedControl
            ariaLabel="Training mode"
            value={mode}
            onChange={(next) => {
              if (isWriting || finishing || isChangingPlan) return
              if (next === 'today' && workoutRoutineId) {
                const routine = routines.find((item) => item.id === workoutRoutineId)
                if (routine) {
                  setActiveSplitId(routine.splitId)
                  setSelectedRoutineId(routine.id)
                }
              }
              setMode(next)
            }}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'edit', label: 'Edit' },
            ]}
          />
        </div>
        {mode === 'today' && orderedRoutines.length > 1 ? (
          <div
            className="day-chips training-console__days"
            role="tablist"
            aria-label="Select training day"
            ref={dayChipsRef}
          >
            {orderedRoutines.map((routine, index) => {
              const isActive = routine.id === selectedRoutine?.id
              const dayNumber = getRoutineDayNumber(routine.name, index)
              return (
                <button
                  key={routine.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Day ${dayNumber}: ${routine.name}`}
                  tabIndex={0}
                  className={isActive ? 'day-chip day-chip--active' : 'day-chip'}
                  onClick={() => void handleChooseRoutine(routine.id)}
                >
                  <span className="numeral" aria-hidden="true">
                    {dayNumber}
                  </span>
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
        <div className="train-today">
          <main className="training-ledger">
            <header className="training-ledger__masthead">
              <div>
                <p className="session-date">
                  {startedAt
                    ? new Intl.DateTimeFormat(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }).format(new Date(startedAt))
                    : ''}
                </p>
                <h2 className="training-ledger__title">{dayTitle}</h2>
              </div>
              <button
                type="button"
                className="btn btn--ghost finish-workout"
                disabled={
                  isWriting ||
                  finishing ||
                  isChangingPlan ||
                  !Object.values(setsByExercise)
                    .flat()
                    .some((set) => set.completedAt)
                }
                onClick={() => void handleFinishWorkout()}
              >
                {finishing ? 'Finishing...' : 'Finish workout'}
              </button>
            </header>
            <div className="exercise-list training-ledger__entries">
              {visibleExerciseIds.map((exerciseId) => {
                const exercise = exerciseMap[exerciseId]
                if (!exercise) return null
                return (
                  <WorkoutExercise
                    onError={setError}
                    key={`${trackerSessionId}.${exerciseId}`}
                    exercise={exercise}
                    sessionId={trackerSessionId}
                    isExpanded={activeExerciseId === exerciseId}
                    onToggle={() => setExpandedExerciseId(exerciseId)}
                    sets={setsByExercise[exerciseId] ?? []}
                    lastSession={historyPreviewByExercise[exerciseId]?.[0]}
                    groupLabel={
                      selectedExerciseIds.includes(exerciseId) ? undefined : 'Added today'
                    }
                    onChanged={(sets) =>
                      setSetsByExercise((current) => ({ ...current, [exerciseId]: sets }))
                    }
                    onBusy={(busy) =>
                      setBusyExercises((current) =>
                        current[exerciseId] === busy
                          ? current
                          : { ...current, [exerciseId]: busy },
                      )
                    }
                    onOpenHistory={(openedAt) =>
                      void handleOpenHistorySheet(exercise, openedAt)
                    }
                    onRemoveExercise={() => void handleRemoveTodayExercise(exerciseId)}
                  />
                )
              })}
            </div>
            {visibleExerciseIds.length === 0 ? (
              <p className="muted">Add an exercise to begin this workout.</p>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--block add-exercise"
              onClick={() => setIsAddOpen((open) => !open)}
              aria-expanded={isAddOpen}
            >
              <PlusIcon />
              Add exercise
            </button>
            {isAddOpen ? (
              <div className="exercise-search">
                <label className="field">
                  <span className="field__label">Search or create an exercise</span>
                  <input
                    id="exercise-search"
                    className="exercise-search__input"
                    type="search"
                    value={exerciseSearch}
                    onChange={(event) => setExerciseSearch(event.target.value)}
                    aria-label="Search exercises"
                    autoComplete="off"
                  />
                </label>
                <div className="exercise-search__results">
                  {exerciseSearchResults.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      className="exercise-search__result"
                      onClick={() => void handleSelectSearchedExercise(exercise.id)}
                    >
                      {exercise.name}
                    </button>
                  ))}
                  {normalizedExerciseSearch &&
                  !exercises.some(
                    (exercise) =>
                      exercise.name.toLowerCase() === normalizedExerciseSearch,
                  ) ? (
                    <button
                      type="button"
                      className="exercise-search__result"
                      onClick={() => void handleCreateTodayExercise()}
                    >
                      Create {exerciseSearch.trim()}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </main>
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
          onCreateRoutine={() =>
            void handleCreateRoutine().catch(() =>
              setError('Could not create the routine.'),
            )
          }
          onRoutineNameChange={setRoutineNameDraft}
          onAddExerciseNameChange={setAddExerciseName}
          onAddExercise={() =>
            void handleAddExerciseToDraft().catch(() =>
              setError('Could not add the exercise.'),
            )
          }
          onAddSuggestion={addExerciseDraft}
          onToggleAdvanced={toggleExerciseDraftDetails}
          onMoveDraft={moveExerciseDraft}
          onRemoveDraft={removeExerciseDraft}
          onUpdateDraft={updateExerciseDraft}
          onSave={() =>
            void handleSaveRoutineEdits().catch(() =>
              setError('Could not save the routine. Your edits are still here.'),
            )
          }
          onDelete={() =>
            void handleDeleteRoutine().catch(() =>
              setError('Could not delete the routine.'),
            )
          }
        />
      )}

      {historySheet ? (
        <BottomSheet
          eyebrow="History"
          title={historySheet.exerciseName}
          openedAt={historySheet.openedAt}
          onClose={closeHistorySheet}
        >
          {historySheet.loadError ? (
            <Banner tone="error">{historySheet.loadError}</Banner>
          ) : null}
          <ExerciseHistory
            onError={setError}
            rows={historySheet.rows}
            isLoading={historySheet.isLoading}
            unit={
              exerciseMap[historySheet.exerciseId]?.progressionSettings.unit ??
              defaultUnit
            }
            onUpdated={async () => {
              const rows = await listExerciseHistory(historySheet.exerciseId)
              setHistorySheet((current) =>
                current?.exerciseId === historySheet.exerciseId
                  ? { ...current, rows }
                  : current,
              )
              await refreshHistoryForExercise(historySheet.exerciseId)
            }}
          />
        </BottomSheet>
      ) : null}
    </section>
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
        <button
          type="button"
          className="btn btn--dashed btn--block"
          onClick={props.onCreateRoutine}
        >
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
          Type a name and press Enter, or choose a matching exercise from the suggestions
          that appear below. New exercises are added when you save the routine.
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
              <article
                key={draft.draftId}
                data-draft-id={draft.draftId}
                className="edit-exercise"
              >
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

function toRoutineExerciseDraft(
  exercise: Exercise,
  draftId: string,
): RoutineExerciseDraft {
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
  return label
    .replace(/^(\d)\s+day/i, '$1-Day')
    .replace('split', 'Split')
    .toUpperCase()
}

function formatSplitOptionLabel(splitId: RoutineSplitId): string {
  return splitId === '4-day-split' ? '4 day' : '3 day'
}

function buildDayTitle(
  routineName: string | undefined,
  selectedRoutineIndex: number,
): string {
  if (!routineName) {
    return `Day ${Math.max(1, selectedRoutineIndex + 1)}`
  }
  const titleSource =
    routineName.replace(/^day\s*\d+\s*[–-]\s*/i, '').trim() || routineName
  return titleSource.replace(/\s*\/\s*/g, ' · ')
}

function getNextRoutineName(routines: Routine[]): string {
  const names = new Set(routines.map((routine) => routine.name.toLowerCase()))
  let index = 1
  while (names.has(`routine ${index}`)) {
    index += 1
  }
  return `Routine ${index}`
}
