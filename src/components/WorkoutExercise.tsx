// ABOUTME: Presents one exercise with explicit set completion and automatic correction saving.
// ABOUTME: Keeps unfinished entry drafts separate from recorded performance on this device.
import { useEffect, useRef, useState, type FocusEvent } from 'react'
import type { Exercise, SessionRecord, SetEntry, Unit } from '../types'
import {
  addSetEntry,
  deleteSessionSet,
  listSessionExerciseEntries,
  updateCompletedSetEntry,
} from '../lib/db'
import { buildProgressionSuggestion } from '../lib/progression'
import { convertWeight, formatWeight } from '../lib/units'
import { CheckIcon, ClockIcon, ChevronDownIcon, MoreIcon } from './icons'

// A tap this soon after a set is logged is treated as an accidental repeat.
const REPEAT_LOG_GUARD_MS = 700

interface EntryDraft {
  id: string
  weight: string
  reps: string
  unit: Unit
}
interface Props {
  exercise: Exercise
  sessionId: string
  isExpanded: boolean
  onToggle: () => void
  sets: SetEntry[]
  lastSession?: { session: SessionRecord; sets: SetEntry[] } | null
  groupLabel?: string
  onChanged: (sets: SetEntry[]) => void
  onBusy: (busy: boolean) => void
  onOpenHistory: (openedAt: number) => void
  onRemoveExercise: () => void
  onError?: (message: string) => void
}

function validDraft(draft: EntryDraft): boolean {
  return (
    /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft.weight.trim()) &&
    /^\d+$/.test(draft.reps.trim()) &&
    Number.isFinite(Number(draft.weight)) &&
    Number.isSafeInteger(Number(draft.reps)) &&
    Number(draft.reps) > 0
  )
}

function readDraft(key: string): EntryDraft | null {
  const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
  if (raw == null) return null
  if (
    typeof raw === 'object' &&
    'id' in raw &&
    typeof raw.id === 'string' &&
    'weight' in raw &&
    typeof raw.weight === 'string' &&
    'reps' in raw &&
    typeof raw.reps === 'string' &&
    'unit' in raw &&
    (raw.unit === 'lb' || raw.unit === 'kg')
  ) {
    return { id: raw.id, weight: raw.weight, reps: raw.reps, unit: raw.unit }
  }
  throw new Error('The saved entry draft could not be read. Recorded sets are intact.')
}

function setDraftValues(set: SetEntry, unit: Unit): EntryDraft {
  return {
    id: set.id,
    weight: String(set.weight),
    reps: set.reps ? String(set.reps) : '',
    unit: set.unit ?? unit,
  }
}

function matches(draft: EntryDraft, set: SetEntry): boolean {
  return (
    validDraft(draft) &&
    Number(draft.weight) === set.weight &&
    Number(draft.reps) === set.reps &&
    draft.unit === (set.unit ?? draft.unit)
  )
}

function summary(sets: SetEntry[], unit: Unit): string {
  const work = sets.filter((set) => set.completedAt && !set.isWarmup)
  if (!work.length) return 'No previous working sets'
  const first = work[0]
  if (
    work.every(
      (set) => set.weight === first.weight && (set.unit ?? unit) === (first.unit ?? unit),
    )
  ) {
    return `${formatWeight(first.weight)} ${first.unit ?? unit} · ${work.map((set) => set.reps).join(', ')} reps`
  }
  return work
    .map((set) => `${formatWeight(set.weight)} ${set.unit ?? unit} × ${set.reps}`)
    .join(' · ')
}

export function WorkoutExercise(props: Props) {
  const { exercise, sessionId, sets, lastSession, onChanged, onBusy } = props
  const unit = exercise.progressionSettings.unit
  const storageKey = `workout-tracker.entry.${sessionId}.${exercise.id}`
  const unfinishedKey = `${storageKey}.unfinished`
  const noteKey = `workout-tracker.notes.${sessionId}.${exercise.id}`
  const [initial] = useState(() => {
    const incomplete = sets.find((set) => !set.completedAt)
    const fallback = incomplete
      ? setDraftValues(incomplete, unit)
      : { id: crypto.randomUUID(), weight: '', reps: '', unit }
    try {
      const stored = readDraft(storageKey) ?? readDraft(unfinishedKey)
      return {
        draft: stored ?? fallback,
        note: localStorage.getItem(noteKey) ?? '',
        error: '',
        restoredDraft: Boolean(
          stored && !sets.some((set) => set.id === stored.id && set.completedAt),
        ),
      }
    } catch (reason) {
      return {
        draft: fallback,
        note: '',
        restoredDraft: false,
        error:
          reason instanceof Error
            ? reason.message
            : 'Device draft storage is unavailable.',
      }
    }
  })
  const [draft, setDraft] = useState(initial.draft)
  const [note, setNote] = useState(initial.note)
  const selected = sets.find((set) => set.id === draft.id && set.completedAt)
  const [status, setStatus] = useState(initial.restoredDraft ? 'Draft saved' : '')
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState(initial.error)
  const [busy, setBusy] = useState(false)
  const [pendingCorrection, setPendingCorrection] = useState(
    Boolean(selected && !matches(initial.draft, selected)),
  )
  const [manage, setManage] = useState(false)
  const [justLogged, setJustLogged] = useState(false)
  const lock = useRef(false)
  const justLoggedRef = useRef(false)
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftRef = useRef(initial.draft)
  const savedRef = useRef(selected)
  const entriesRef = useRef(sets)
  const dirtyRef = useRef(Boolean(selected && !matches(initial.draft, selected)))
  const savingRef = useRef(false)
  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const persistRef = useRef<() => Promise<void>>(async () => undefined)
  const callbacksRef = useRef({ onChanged, onBusy, onError: props.onError })
  const completed = sets.filter((set) => set.completedAt)
  const canAdjustReps =
    /^\d*$/.test(draft.reps.trim()) && Number.isSafeInteger(Number(draft.reps))
  const work = completed.filter((set) => !set.isWarmup)
  const workTarget = exercise.progressionSettings.workSetsTarget
  const previousWork = lastSession?.sets.filter((set) => set.completedAt && !set.isWarmup)
  const suggestion = lastSession?.session.endedAt
    ? buildProgressionSuggestion(exercise.progressionSettings, lastSession.sets)
    : null

  function report(message: string): void {
    if (mountedRef.current) setError(message)
    else callbacksRef.current.onError?.(message)
  }

  function store(key: string, value: string | null): boolean {
    try {
      if (value == null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
      return true
    } catch {
      report(
        'Device draft storage is unavailable. Keep this workout open until the set is saved.',
      )
      return false
    }
  }

  function publish(entry: SetEntry): void {
    entriesRef.current = [
      ...entriesRef.current.filter((set) => set.id !== entry.id),
      entry,
    ].sort((a, b) => a.index - b.index)
    callbacksRef.current.onChanged(entriesRef.current)
  }

  function markSaved(confirmation: string): void {
    dirtyRef.current = false
    store(storageKey, null)
    try {
      if (readDraft(unfinishedKey)?.id === draftRef.current.id) store(unfinishedKey, null)
    } catch {
      report('The set is saved, but its device draft could not be cleared.')
    }
    if (mountedRef.current) {
      setPendingCorrection(false)
      setStatus(confirmation)
    }
  }

  async function persist(): Promise<void> {
    clearTimeout(timerRef.current)
    if (savingRef.current || lock.current || !dirtyRef.current || !savedRef.current)
      return
    if (!validDraft(draftRef.current)) return
    savingRef.current = true
    callbacksRef.current.onBusy(true)
    if (mountedRef.current) setBusy(true)
    try {
      while (dirtyRef.current && savedRef.current?.id === draftRef.current.id) {
        const next = draftRef.current
        if (!validDraft(next)) break
        if (matches(next, savedRef.current)) {
          markSaved('Correction saved')
          break
        }
        if (mountedRef.current) {
          setStatus('Saving correction…')
          setError('')
        }
        const entry = await updateCompletedSetEntry(next.id, {
          weight: Number(next.weight),
          reps: Number(next.reps),
          unit: next.unit,
        })
        savedRef.current = entry
        publish(entry)
      }
    } catch {
      report(
        'Correction not saved. Your values are still here. Retry or cancel the correction.',
      )
      if (mountedRef.current) setStatus('Not saved')
    } finally {
      savingRef.current = false
      if (mountedRef.current) setBusy(false)
      callbacksRef.current.onBusy(dirtyRef.current)
    }
  }

  useEffect(() => {
    entriesRef.current = sets
    callbacksRef.current = { onChanged, onBusy, onError: props.onError }
    persistRef.current = persist
  })

  useEffect(() => {
    mountedRef.current = true
    if (dirtyRef.current) {
      callbacksRef.current.onBusy(true)
      setStatus('Correction not saved')
      void persistRef.current()
    }
    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
      clearTimeout(guardTimerRef.current)
      void persistRef.current()
    }
  }, [])

  function change(field: 'weight' | 'reps', value: string): void {
    const next = { ...draftRef.current, [field]: value }
    draftRef.current = next
    setDraft(next)
    setError('')
    const stored = store(storageKey, JSON.stringify(next))
    if (savedRef.current?.id === next.id) {
      dirtyRef.current = true
      setPendingCorrection(true)
      callbacksRef.current.onBusy(true)
      setStatus('Correction not saved')
      clearTimeout(timerRef.current)
      if (validDraft(next))
        timerRef.current = setTimeout(() => {
          void persistRef.current()
        }, 400)
    } else {
      setStatus(stored ? 'Draft saved' : 'Draft not saved')
    }
  }

  function adjustReps(delta: number): void {
    const raw = draftRef.current.reps.trim()
    if (!/^\d*$/.test(raw)) return
    const current = Number(raw)
    const next = Math.max(0, current + delta)
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(next) || next === current)
      return
    change('reps', String(next))
  }

  function blur(event: FocusEvent<HTMLInputElement>): void {
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget.getAttribute('data-cancel-workout-correction') === draft.id
    )
      return
    if (!dirtyRef.current) return
    if (!validDraft(draftRef.current)) {
      setError(
        'Enter a weight of 0 or more and whole reps above 0, or cancel the correction.',
      )
      return
    }
    void persist()
  }

  async function complete(): Promise<void> {
    if (lock.current || savingRef.current || savedRef.current || justLoggedRef.current)
      return
    const next = draftRef.current
    if (!validDraft(next)) {
      setError('Enter a weight of 0 or more and whole reps above 0.')
      return
    }
    lock.current = true
    setBusy(true)
    callbacksRef.current.onBusy(true)
    setStatus('Saving…')
    let logged: SetEntry | undefined
    try {
      const entry = await addSetEntry(sessionId, exercise.id, {
        id: next.id,
        weight: Number(next.weight),
        reps: Number(next.reps),
        unit: next.unit,
        completed: true,
      })
      savedRef.current = entry
      logged = entry
      publish(entry)
      dirtyRef.current = !matches(draftRef.current, entry)
      if (mountedRef.current) {
        setPendingCorrection(dirtyRef.current)
        setError('')
        setLastLoggedId(entry.id)
        setAnnouncement(`Set ${completedPosition(entry.id)} saved`)
      }
      if (!dirtyRef.current) markSaved('')
    } catch {
      report('Set not saved. Your values are still here. Try Log set again.')
      if (mountedRef.current) setStatus('Not saved')
    } finally {
      lock.current = false
      if (mountedRef.current) setBusy(false)
      callbacksRef.current.onBusy(dirtyRef.current)
      if (dirtyRef.current) await persist()
    }
    if (
      logged &&
      mountedRef.current &&
      !dirtyRef.current &&
      savedRef.current?.id === logged.id
    )
      advanceAfterLog(savedRef.current)
  }

  function completedPosition(id: string): number {
    return (
      entriesRef.current
        .filter((set) => set.completedAt)
        .findIndex((set) => set.id === id) + 1
    )
  }

  function advanceAfterLog(entry: SetEntry): void {
    nextSet(entry)
    setStatus(`Prefilled from set ${completedPosition(entry.id)}`)
    justLoggedRef.current = true
    setJustLogged(true)
    clearTimeout(guardTimerRef.current)
    guardTimerRef.current = setTimeout(() => {
      justLoggedRef.current = false
      if (mountedRef.current) setJustLogged(false)
    }, REPEAT_LOG_GUARD_MS)
  }

  function nextSet(source?: SetEntry): void {
    if (lock.current || savingRef.current || dirtyRef.current) return
    const last = source ?? [...work].reverse()[0]
    setError('')
    let unfinished: EntryDraft | null = null
    try {
      if (!source) unfinished = readDraft(unfinishedKey)
    } catch {
      report('The unfinished entry could not be restored. Recorded sets are intact.')
    }
    const incomplete = entriesRef.current.find((set) => !set.completedAt)
    const next =
      unfinished ??
      (!source && incomplete
        ? setDraftValues(incomplete, unit)
        : {
            id: crypto.randomUUID(),
            weight: last
              ? formatWeight(convertWeight(last.weight, last.unit ?? unit, unit))
              : '',
            reps: last ? String(last.reps) : '',
            unit,
          })
    savedRef.current = undefined
    draftRef.current = next
    setDraft(next)
    const stored = store(storageKey, JSON.stringify(next))
    if (stored) store(unfinishedKey, null)
    setStatus(stored ? 'Draft saved' : 'Draft not saved')
  }

  function editSet(set: SetEntry): void {
    if (lock.current || savingRef.current || dirtyRef.current) return
    setError('')
    if (!savedRef.current && (draftRef.current.weight || draftRef.current.reps)) {
      if (!store(unfinishedKey, JSON.stringify(draftRef.current))) return
    }
    const next = setDraftValues(set, unit)
    savedRef.current = set
    draftRef.current = next
    setDraft(next)
    store(storageKey, null)
    setStatus('')
  }

  function cancelCorrection(): void {
    if (savingRef.current || !savedRef.current) return
    clearTimeout(timerRef.current)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      setError(
        'The correction draft could not be cleared. Keep this workout open and try canceling again.',
      )
      return
    }
    const next = setDraftValues(savedRef.current, unit)
    draftRef.current = next
    setDraft(next)
    setError('')
    dirtyRef.current = false
    setPendingCorrection(false)
    setStatus('')
    callbacksRef.current.onBusy(false)
  }

  function changeNote(value: string): void {
    setNote(value)
    setError('')
    if (!store(noteKey, value)) setStatus('Note not saved')
  }

  async function remove(): Promise<void> {
    if (!selected || lock.current || savingRef.current) return
    clearTimeout(timerRef.current)
    lock.current = true
    setBusy(true)
    callbacksRef.current.onBusy(true)
    try {
      await deleteSessionSet(sessionId, exercise.id, selected.id)
      entriesRef.current = await listSessionExerciseEntries(sessionId, exercise.id)
      callbacksRef.current.onChanged(entriesRef.current)
      dirtyRef.current = false
      setPendingCorrection(false)
      savedRef.current = undefined
      lock.current = false
      nextSet()
      setError('')
    } catch {
      setError('Could not remove this set. Try again.')
    } finally {
      lock.current = false
      setBusy(false)
      callbacksRef.current.onBusy(dirtyRef.current)
    }
  }

  const selectedIndex = selected
    ? completed.findIndex((set) => set.id === selected.id)
    : -1
  const todayProgress =
    completed.length === 0
      ? ''
      : workTarget > 0
        ? `${work.length} of ${workTarget} sets today`
        : `${work.length} ${work.length === 1 ? 'set' : 'sets'} today`
  const lastSummary =
    !todayProgress && previousWork?.length
      ? `Last · ${summary(lastSession!.sets, unit)}`
      : ''
  const optionsId = `options-${sessionId}-${exercise.id}`

  if (!props.isExpanded) {
    return (
      <article
        data-exercise-id={exercise.id}
        className={`exercise-card${work.length >= workTarget ? ' exercise-card--complete' : ''}`}
      >
        <button
          type="button"
          className="exercise-card__title-btn"
          aria-expanded={false}
          aria-controls={`entry-${exercise.id}`}
          onClick={props.onToggle}
        >
          <span className="exercise-card__text">
            {props.groupLabel ? (
              <span className="exercise-card__group">{props.groupLabel}</span>
            ) : null}
            <span className="exercise-card__name">{exercise.name}</span>
            {todayProgress ? (
              <span className="exercise-card__summary exercise-card__today">
                {work.length >= workTarget && workTarget > 0 ? (
                  <CheckIcon width={14} height={14} className="exercise-card__done" />
                ) : null}
                {todayProgress}
              </span>
            ) : lastSummary ? (
              <span className="exercise-card__summary exercise-card__last">
                {lastSummary}
              </span>
            ) : null}
          </span>
          <ChevronDownIcon width={18} height={18} className="exercise-card__chevron" />
        </button>
      </article>
    )
  }

  return (
    <article
      data-exercise-id={exercise.id}
      className={`exercise-card exercise-card--active${work.length >= workTarget ? ' exercise-card--complete' : ''}`}
    >
      <div className="exercise-card__head">
        <button
          type="button"
          className="exercise-card__title-btn"
          aria-expanded
          aria-controls={`entry-${exercise.id}`}
          onClick={props.onToggle}
        >
          <span className="exercise-card__text">
            {props.groupLabel ? (
              <span className="exercise-card__group">{props.groupLabel}</span>
            ) : null}
            <span className="exercise-card__name">{exercise.name}</span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small exercise-history-button"
          aria-label={`Open history for ${exercise.name}`}
          onClick={(event) => props.onOpenHistory(event.timeStamp)}
        >
          <ClockIcon width={18} height={18} />
          <span>History</span>
        </button>
        <button
          type="button"
          className="icon-btn exercise-menu-button"
          aria-label={`Exercise options for ${exercise.name}`}
          aria-expanded={manage}
          aria-controls={optionsId}
          onClick={() => setManage(!manage)}
        >
          <MoreIcon width={20} height={20} />
        </button>
      </div>
      {manage ? (
        <section
          className="exercise-options"
          id={optionsId}
          aria-label={`Options for ${exercise.name}`}
        >
          {suggestion ? <p className="suggestion">{suggestion.message}</p> : null}
          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="notes-input"
              rows={2}
              value={note}
              onChange={(event) => changeNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || pendingCorrection}
            onClick={props.onRemoveExercise}
          >
            Remove from this workout
          </button>
        </section>
      ) : null}
      {lastSession !== undefined ? (
        <div className="previous-line">
          {previousWork?.length ? (
            <p className="previous-performance">
              <span className="previous-performance__label">
                Last ·{' '}
                {new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(lastSession!.session.startedAt))}
              </span>{' '}
              <span className="previous-performance__value">
                {summary(lastSession!.sets, unit)}
              </span>
            </p>
          ) : (
            <p className="previous-performance previous-performance--none">
              {lastSession ? summary(lastSession.sets, unit) : 'First session'}
            </p>
          )}
          {!selected && !draft.weight && previousWork?.length ? (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                nextSet(previousWork[0])
                setStatus('Prefilled from last session')
              }}
            >
              Use last
            </button>
          ) : null}
        </div>
      ) : null}
      {completed.length ? (
        <ol className="logged-sets" aria-label={`Sets logged for ${exercise.name}`}>
          {completed.map((set, index) => {
            const state =
              set.id === selected?.id
                ? 'Editing'
                : set.id === lastLoggedId
                  ? 'Saved'
                  : 'Logged'
            return (
              <li
                key={set.id}
                className={`logged-set${state === 'Editing' ? ' logged-set--selected' : ''}${state === 'Saved' ? ' logged-set--fresh' : ''}`}
              >
                <span className="logged-set__index">
                  {set.isWarmup ? 'W' : index + 1}
                </span>
                <span className="logged-set__value">
                  {formatWeight(set.weight)} {set.unit ?? unit} × {set.reps}
                </span>
                <span className="logged-set__state">
                  <CheckIcon width={14} height={14} />
                  <span className="logged-set__state-text">{state}</span>
                </span>
                {state === 'Editing' ? null : (
                  <button
                    type="button"
                    className="logged-set__edit"
                    aria-label={`Edit set ${index + 1} for ${exercise.name}`}
                    disabled={busy || pendingCorrection}
                    onClick={() => editSet(set)}
                  >
                    Edit
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      ) : null}
      <span className="visually-hidden logged-set-announcement" role="status">
        {announcement}
      </span>
      <div id={`entry-${exercise.id}`} className="quick-entry">
        <div className="entry-meta">
          <h3 className="entry-caption">
            {selected
              ? `Editing set ${selectedIndex + 1}`
              : `Set ${completed.length + 1}`}
          </h3>
          <span className="save-state" role="status">
            {status}
          </span>
        </div>
        <div className={`set-entry${error ? ' set-entry--invalid' : ''}`}>
          <label className="set-entry__field">
            <span className="field__label">Weight ({draft.unit})</span>
            <input
              className="set-entry__input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={`${exercise.name} weight`}
              aria-invalid={Boolean(error) || undefined}
              value={draft.weight}
              onChange={(event) => change('weight', event.target.value.replace(',', '.'))}
              onBlur={blur}
            />
          </label>
          <div className="set-entry__field">
            <label className="field__label" htmlFor={`reps-${sessionId}-${exercise.id}`}>
              Reps
            </label>
            <div className="set-entry__reps-control">
              <button
                type="button"
                className="set-entry__adjust"
                aria-label={`Decrease reps for ${exercise.name}`}
                disabled={!canAdjustReps || Number(draft.reps) <= 0}
                onClick={() => adjustReps(-1)}
              >
                −1
              </button>
              <input
                id={`reps-${sessionId}-${exercise.id}`}
                className="set-entry__input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${exercise.name} reps`}
                aria-invalid={Boolean(error) || undefined}
                value={draft.reps}
                onChange={(event) => change('reps', event.target.value)}
                onBlur={blur}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !selected) void complete()
                }}
              />
              <button
                type="button"
                className="set-entry__adjust"
                aria-label={`Increase reps for ${exercise.name}`}
                disabled={!canAdjustReps || Number(draft.reps) >= Number.MAX_SAFE_INTEGER}
                onClick={() => adjustReps(1)}
              >
                +1
              </button>
            </div>
          </div>
        </div>
        {error ? (
          <p className="entry-error" role="alert">
            {error}
          </p>
        ) : null}
        {selected ? (
          <div className="entry-actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete set
            </button>
            <button
              type="button"
              className="btn btn--secondary next-set"
              disabled={busy || pendingCorrection}
              onClick={() => nextSet()}
            >
              Done editing
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--block quick-entry__save"
            aria-disabled={busy || justLogged || undefined}
            onClick={() => void complete()}
          >
            Log set
          </button>
        )}
        {pendingCorrection ? (
          <div className="entry-actions">
            {error && validDraft(draft) ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => void persist()}
              >
                Retry correction
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              data-cancel-workout-correction={draft.id}
              onClick={cancelCorrection}
            >
              Cancel correction
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
