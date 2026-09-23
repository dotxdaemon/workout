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
import { ClockIcon, ChevronDownIcon } from './icons'

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
  lastSession?: { session: SessionRecord; sets: SetEntry[] }
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
  if (!work.length) return 'No previous session'
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
      return {
        draft: readDraft(storageKey) ?? readDraft(unfinishedKey) ?? fallback,
        note: localStorage.getItem(noteKey) ?? '',
        error: '',
      }
    } catch (reason) {
      return {
        draft: fallback,
        note: '',
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
  const [status, setStatus] = useState('Not completed')
  const [error, setError] = useState(initial.error)
  const [busy, setBusy] = useState(false)
  const [pendingCorrection, setPendingCorrection] = useState(
    Boolean(selected && !matches(initial.draft, selected)),
  )
  const [manage, setManage] = useState(false)
  const lock = useRef(false)
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

  function markSaved(): void {
    dirtyRef.current = false
    store(storageKey, null)
    try {
      if (readDraft(unfinishedKey)?.id === draftRef.current.id) store(unfinishedKey, null)
    } catch {
      report('The set is saved, but its device draft could not be cleared.')
    }
    if (mountedRef.current) {
      setPendingCorrection(false)
      setStatus('Saved on this device')
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
          markSaved()
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
    } else if (savedRef.current) setStatus('Saved on this device')
    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
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
      setStatus(stored ? 'Draft saved on this device' : 'Draft not saved')
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
    if (lock.current || savingRef.current || savedRef.current) return
    const next = draftRef.current
    if (!validDraft(next)) {
      setError('Enter a weight of 0 or more and whole reps above 0.')
      return
    }
    lock.current = true
    setBusy(true)
    callbacksRef.current.onBusy(true)
    setStatus('Saving…')
    try {
      const entry = await addSetEntry(sessionId, exercise.id, {
        id: next.id,
        weight: Number(next.weight),
        reps: Number(next.reps),
        unit: next.unit,
        completed: true,
      })
      savedRef.current = entry
      publish(entry)
      dirtyRef.current = !matches(draftRef.current, entry)
      if (mountedRef.current) {
        setPendingCorrection(dirtyRef.current)
        setError('')
      }
      if (!dirtyRef.current) markSaved()
    } catch {
      report('Set not saved. Your values are still here. Try Complete set again.')
      if (mountedRef.current) setStatus('Not saved')
    } finally {
      lock.current = false
      if (mountedRef.current) setBusy(false)
      callbacksRef.current.onBusy(dirtyRef.current)
      if (dirtyRef.current) await persist()
    }
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
    setStatus(stored ? 'Draft saved on this device' : 'Draft not saved')
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
    setStatus('Saved on this device')
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
    setStatus('Saved on this device')
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

  return (
    <article
      data-exercise-id={exercise.id}
      className={`exercise-card${props.isExpanded ? ' exercise-card--active' : ''}${work.length >= exercise.progressionSettings.workSetsTarget ? ' exercise-card--complete' : ''}`}
    >
      <div className="exercise-card__head">
        <button
          type="button"
          className="exercise-card__title-btn"
          aria-expanded={props.isExpanded}
          aria-controls={`entry-${exercise.id}`}
          onClick={props.onToggle}
        >
          {props.groupLabel ? (
            <span className="exercise-card__group">{props.groupLabel}</span>
          ) : null}
          <span className="exercise-card__name">
            {exercise.name}
            <ChevronDownIcon width={16} height={16} className="exercise-card__chevron" />
          </span>
        </button>
        <button
          type="button"
          className="icon-btn exercise-history-button"
          aria-label={`Open history for ${exercise.name}`}
          onClick={(event) => props.onOpenHistory(event.timeStamp)}
        >
          <ClockIcon />
        </button>
      </div>
      {props.isExpanded ||
      lastSession?.sets.some((set) => set.completedAt && !set.isWarmup) ? (
        <div className="exercise-history-line">
          <p className="last-line">
            <span className="last-line__label">Last:</span>
            <span className="last-line__value">
              {summary(lastSession?.sets ?? [], unit)}
            </span>
          </p>
          {props.isExpanded &&
          !selected &&
          !draft.weight &&
          lastSession?.sets.some((set) => set.completedAt && !set.isWarmup) ? (
            <button
              type="button"
              className="text-action"
              onClick={() =>
                nextSet(lastSession.sets.find((set) => set.completedAt && !set.isWarmup))
              }
            >
              Use last
            </button>
          ) : null}
        </div>
      ) : null}
      {completed.length ? (
        <div className="set-track" aria-label="Completed sets">
          {completed.map((set, index) => (
            <button
              key={set.id}
              type="button"
              className={`set-pill${set.id === selected?.id ? ' set-pill--selected' : ''}`}
              aria-label={`Edit set ${index + 1} for ${exercise.name}`}
              disabled={busy || pendingCorrection}
              onClick={() => {
                editSet(set)
                if (!props.isExpanded) props.onToggle()
              }}
            >
              <span className="set-pill__num">
                ✓ {set.isWarmup ? 'Warm-up' : index + 1}
              </span>
              {formatWeight(set.weight)} {set.unit ?? unit} × {set.reps}
            </button>
          ))}
        </div>
      ) : null}
      {props.isExpanded ? (
        <div id={`entry-${exercise.id}`} className="quick-entry">
          <div className="entry-meta">
            <p className="entry-caption">
              {selected
                ? `Set ${completed.findIndex((set) => set.id === selected.id) + 1} · completed`
                : `Set ${completed.length + 1} · not completed`}
            </p>
            <span className="save-state" role="status">
              {status === 'Not completed' ? '' : status}
            </span>
          </div>
          <div className={`set-entry${error ? ' set-entry--invalid' : ''}`}>
            <label className="set-entry__value">
              <span className="field__label">Weight ({draft.unit})</span>
              <input
                className="set-entry__input"
                type="text"
                inputMode="decimal"
                placeholder="—"
                aria-label={`${exercise.name} weight`}
                aria-invalid={Boolean(error) || undefined}
                value={draft.weight}
                onChange={(event) =>
                  change('weight', event.target.value.replace(',', '.'))
                }
                onBlur={blur}
              />
            </label>
            <div className="set-entry__value">
              <label
                className="field__label"
                htmlFor={`reps-${sessionId}-${exercise.id}`}
              >
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
                  placeholder="—"
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
                  disabled={
                    !canAdjustReps || Number(draft.reps) >= Number.MAX_SAFE_INTEGER
                  }
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
          <div className="entry-actions">
            <button
              type="button"
              className="text-action"
              aria-expanded={manage}
              aria-controls={`options-${sessionId}-${exercise.id}`}
              onClick={() => setManage(!manage)}
            >
              Options
            </button>
            {selected ? (
              <button
                type="button"
                className="btn btn--primary next-set"
                disabled={busy || pendingCorrection}
                onClick={() => nextSet()}
              >
                Add next set
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary quick-entry__save"
                disabled={busy}
                onClick={() => void complete()}
              >
                Complete set
              </button>
            )}
          </div>
          {pendingCorrection ? (
            <div className="entry-actions">
              {error && validDraft(draft) ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void persist()}
                >
                  Retry correction
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                data-cancel-workout-correction={draft.id}
                onClick={cancelCorrection}
              >
                Cancel correction
              </button>
            </div>
          ) : null}
          {manage ? (
            <section
              className="exercise-options"
              id={`options-${sessionId}-${exercise.id}`}
              aria-label={`Options for ${exercise.name}`}
            >
              {suggestion ? <p className="suggestion">{suggestion.message}</p> : null}
              {selected ? (
                <button
                  type="button"
                  className="btn btn--danger set-pill__remove"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Remove selected set
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy || pendingCorrection}
                onClick={props.onRemoveExercise}
              >
                Remove from this workout
              </button>
              <label className="field">
                <span className="field__label">Notes</span>
                <textarea
                  className="notes-input"
                  rows={2}
                  value={note}
                  onChange={(event) => changeNote(event.target.value)}
                />
              </label>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
