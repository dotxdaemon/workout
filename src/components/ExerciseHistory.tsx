// ABOUTME: Displays dated exercise history with recorded units and ordered working and warm-up sets.
// ABOUTME: Autosaves corrections to completed records while keeping estimates secondary.
import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { updateCompletedSetEntry } from '../lib/db'
import { summarizeHistoryRows } from '../lib/sessionStats'
import { formatWeight } from '../lib/units'
import type { SessionRecord, SetEntry, Unit } from '../types'
import { EmptyState } from './EmptyState'
import { InboxIcon } from './icons'

interface ExerciseHistoryProps {
  rows: Array<{ session: SessionRecord; sets: SetEntry[] }>
  unit: Unit
  isLoading?: boolean
  onUpdated?: () => void | Promise<void>
  onError?: (message: string) => void
}

export function ExerciseHistory({
  rows,
  unit,
  isLoading,
  onUpdated,
  onError,
}: ExerciseHistoryProps) {
  const overview = summarizeHistoryRows(
    rows.map((row) => ({ sets: row.sets, endedAt: row.session.endedAt })),
    unit,
  )

  if (rows.length === 0) {
    return isLoading ? (
      <p role="status" className="muted">
        Loading history…
      </p>
    ) : (
      <EmptyState
        glyph={<InboxIcon width={30} height={30} />}
        title="No history yet"
        body="Finish a workout to see its recorded sets here."
      />
    )
  }

  return (
    <>
      {rows.map((row) => (
        <article key={row.session.id} className="history-row">
          <header className="history-row__head">
            <time className="history-row__date" dateTime={row.session.startedAt}>
              {new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }).format(new Date(row.session.startedAt))}
            </time>
            <span className="muted">Completed workout</span>
          </header>
          <div className="history-sets">
            {[...row.sets]
              .sort((first, second) => first.index - second.index)
              .map((set) => (
                <HistorySet
                  key={set.id}
                  set={set}
                  unit={set.unit ?? unit}
                  onUpdated={onUpdated}
                  onError={onError}
                />
              ))}
          </div>
        </article>
      ))}
      {overview.best ? (
        <details className="history-estimates">
          <summary>Estimated strength</summary>
          <section className="history-overview" aria-label="History overview">
            <div className="history-overview__stat">
              <span className="history-overview__label">Best in shown history</span>
              <span className="history-overview__value numeral">
                {formatWeight(overview.best.weight)} {unit} × {overview.best.reps}
              </span>
              <span className="history-overview__sub numeral">
                Estimated 1RM {formatWeight(overview.best.estimatedOneRepMax)} {unit}
              </span>
            </div>
            <TrendSparkline points={overview.trendPoints} />
          </section>
          <p className="field__hint">
            Estimate: weight × (1 + reps ÷ 30), from completed working sets. Loads
            converted to {unit} for comparison.
          </p>
        </details>
      ) : null}
    </>
  )
}

interface SetDraft {
  weight: string
  reps: string
}

function parseDraft(draft: SetDraft): { weight: number; reps: number } | null {
  const weightText = draft.weight.trim().replace(',', '.')
  const repsText = draft.reps.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weightText) || !/^\d+$/.test(repsText))
    return null
  const weight = Number(weightText)
  const reps = Number(repsText)
  return Number.isFinite(weight) && Number.isSafeInteger(reps) && reps > 0
    ? { weight, reps }
    : null
}

function draftMatches(draft: SetDraft, set: SetEntry): boolean {
  const values = parseDraft(draft)
  return values?.weight === set.weight && values?.reps === set.reps
}

function HistorySet({
  set,
  unit,
  onUpdated,
  onError,
}: {
  set: SetEntry
  unit: Unit
  onUpdated?: () => void | Promise<void>
  onError?: (message: string) => void
}) {
  const storageKey = `workout-tracker.entry.history.${set.id}`
  const [initial] = useState(() => {
    const fallback = { weight: String(set.weight), reps: String(set.reps) }
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (raw == null) return { draft: fallback, error: null }
      if (
        typeof raw === 'object' &&
        'weight' in raw &&
        typeof raw.weight === 'string' &&
        'reps' in raw &&
        typeof raw.reps === 'string'
      ) {
        return { draft: { weight: raw.weight, reps: raw.reps }, error: null }
      }
      throw new Error('The saved correction could not be read. Recorded sets are intact.')
    } catch (reason) {
      return {
        draft: fallback,
        error:
          reason instanceof Error
            ? reason.message
            : 'Device draft storage is unavailable.',
      }
    }
  })
  const [recorded, setRecorded] = useState(set)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SetDraft>(initial.draft)
  const [status, setStatus] = useState(
    draftMatches(initial.draft, set) ? '' : 'Correction not saved',
  )
  const [error, setError] = useState<string | null>(initial.error)
  const draftRef = useRef(draft)
  const savedRef = useRef(set)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const dirtyRef = useRef(!draftMatches(initial.draft, set))
  const mountedRef = useRef(true)
  const persistRef = useRef<() => Promise<void>>(async () => undefined)

  function clearStoredDraft(): void {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      const message =
        'The correction is saved, but its draft could not be cleared from this device.'
      if (mountedRef.current) setError(message)
      else onError?.(message)
    }
  }

  async function persist(): Promise<void> {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (savingRef.current || !dirtyRef.current) return
    const first = parseDraft(draftRef.current)
    if (!first) {
      if (mountedRef.current)
        setStatus('Enter a weight of 0 or more and whole reps of 1 or more.')
      return
    }
    savingRef.current = true
    try {
      while (true) {
        const values = parseDraft(draftRef.current)
        if (!values) break
        if (
          values.weight === savedRef.current.weight &&
          values.reps === savedRef.current.reps
        ) {
          if (mountedRef.current) {
            setStatus('Saved on device')
            setError(null)
          }
          dirtyRef.current = false
          clearStoredDraft()
          break
        }
        if (mountedRef.current) {
          setStatus('Saving…')
          setError(null)
        }
        const updated = await updateCompletedSetEntry(set.id, { ...values, unit })
        savedRef.current = updated
        if (mountedRef.current) setRecorded(updated)
        try {
          await onUpdated?.()
        } catch {
          onError?.(
            'The correction was saved on this device, but history could not refresh. Reopen history to try again.',
          )
        }
      }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'The correction could not be saved.'
      if (mountedRef.current) {
        setStatus('Not saved')
        setError(message)
      } else {
        onError?.(`History correction not saved: ${message}`)
      }
    } finally {
      savingRef.current = false
    }
  }

  useEffect(() => {
    persistRef.current = persist
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      void persistRef.current()
    }
  }, [])

  function change(field: keyof SetDraft, value: string): void {
    const next = { ...draftRef.current, [field]: value }
    dirtyRef.current = true
    draftRef.current = next
    setDraft(next)
    setStatus('Not saved')
    setError(null)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      setError(
        'The correction draft could not be saved. Keep history open until the set is saved.',
      )
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    if (parseDraft(next))
      timerRef.current = setTimeout(() => {
        void persist()
      }, 600)
  }

  function cancelCorrection(): void {
    if (savingRef.current) return
    try {
      localStorage.removeItem(storageKey)
    } catch {
      setError(
        'The correction draft could not be cleared. Keep history open and try again.',
      )
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const next = {
      weight: String(savedRef.current.weight),
      reps: String(savedRef.current.reps),
    }
    dirtyRef.current = false
    draftRef.current = next
    setDraft(next)
    setStatus('Saved on device')
    setError(null)
  }

  function blur(event: FocusEvent<HTMLInputElement>): void {
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget.getAttribute('data-cancel-history-correction') === set.id
    )
      return
    void persist()
  }

  return (
    <div className="history-set" data-history-set={set.id}>
      <div className="history-set__summary">
        <span className="history-set__position">
          {set.isWarmup ? 'Warm-up' : 'Set'} {set.index + 1}
        </span>
        <span className="numeral">
          {formatWeight(recorded.weight)} {unit} × {recorded.reps} reps
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          aria-label={`Correct set ${set.index + 1}, ${formatWeight(recorded.weight)} ${unit} by ${recorded.reps} reps`}
          aria-expanded={editing}
          onClick={() => {
            if (editing) void persist()
            setEditing(!editing)
          }}
        >
          {editing ? 'Close edit' : 'Edit'}
        </button>
      </div>
      {!editing && !draftMatches(draft, recorded) ? (
        <p className="field__hint">Correction not saved</p>
      ) : null}
      {editing ? (
        <div className="history-set__editor">
          <div className="field-grid">
            <label className="field">
              <span className="field__label">Weight ({unit})</span>
              <input
                value={draft.weight}
                inputMode="decimal"
                autoComplete="off"
                onChange={(event) => change('weight', event.target.value)}
                onBlur={blur}
              />
            </label>
            <label className="field">
              <span className="field__label">Reps</span>
              <input
                value={draft.reps}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => change('reps', event.target.value)}
                onBlur={blur}
              />
            </label>
          </div>
          <p className="field__hint" role="status">
            {status || 'Corrections save automatically on this device.'}
          </p>
          {!draftMatches(draft, recorded) ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              data-cancel-history-correction={set.id}
              disabled={status === 'Saving…'}
              onClick={cancelCorrection}
            >
              Cancel correction
            </button>
          ) : null}
          {error ? (
            <div role="alert">
              <p>{error} Your entered values are kept here.</p>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  void persist()
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TrendSparkline({ points }: { points: number[] }) {
  const visiblePoints = points.slice(-12)
  if (visiblePoints.length < 2) return null
  const width = 132
  const height = 34
  const min = Math.min(...visiblePoints)
  const range = Math.max(...visiblePoints) - min
  const coords = visiblePoints.map((value, index) => [
    4 + (index * (width - 8)) / (visiblePoints.length - 1),
    range === 0 ? height / 2 : height - 5 - ((value - min) / range) * (height - 10),
  ])
  const [lastX, lastY] = coords[coords.length - 1]
  return (
    <svg
      className="history-overview__spark"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        className="history-overview__spark-line"
        points={coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
      />
      <circle
        className="history-overview__spark-dot"
        cx={lastX.toFixed(1)}
        cy={lastY.toFixed(1)}
        r={4}
      />
    </svg>
  )
}
