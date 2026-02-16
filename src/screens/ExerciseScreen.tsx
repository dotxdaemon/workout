import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getExercise, listExerciseHistory, updateExercise } from '../lib/db'
import { formatDateTime, formatNumber } from '../lib/format'
import { summarizeExerciseHistory } from '../lib/history'
import type {
  Exercise,
  ProgressionSettings,
  SessionRecord,
  SetEntry,
  Unit,
} from '../types'

export function ExerciseScreen() {
  const navigate = useNavigate()
  const params = useParams<{ exerciseId: string }>()
  const exerciseId = params.exerciseId ?? ''

  const [exercise, setExercise] = useState<Exercise>()
  const [settings, setSettings] = useState<ProgressionSettings>()
  const [history, setHistory] = useState<
    Array<{ session: SessionRecord; sets: SetEntry[] }>
  >([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!exerciseId) {
      navigate('/')
      return
    }

    const [loadedExercise, loadedHistory] = await Promise.all([
      getExercise(exerciseId),
      listExerciseHistory(exerciseId, 10),
    ])

    if (!loadedExercise) {
      navigate('/')
      return
    }

    setExercise(loadedExercise)
    setSettings(loadedExercise.progressionSettings)
    setHistory(loadedHistory)
  }, [exerciseId, navigate])

  useEffect(() => {
    void loadData().catch(() => {
      setError('Unable to load exercise data.')
    })
  }, [loadData])

  const summary = useMemo(() => summarizeExerciseHistory(history), [history])

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!exercise || !settings) {
      return
    }

    if (settings.repMin > settings.repMax) {
      setError('repMin must be less than or equal to repMax.')
      return
    }

    if (settings.workSetsTarget < 1) {
      setError('workSetsTarget must be at least 1.')
      return
    }

    if (settings.weightIncrement <= 0) {
      setError('weightIncrement must be greater than 0.')
      return
    }

    await updateExercise(exercise.id, {
      progressionSettings: settings,
      unitDefault: settings.unit,
    })
    setExercise((current) =>
      current
        ? {
            ...current,
            progressionSettings: settings,
            unitDefault: settings.unit,
          }
        : current,
    )
    setError('')
    setMessage('Progression settings saved.')
  }

  if (!exercise || !settings) {
    return (
      <section className="page">
        <p>Loading exercise...</p>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{exercise.name}</h1>
        <p>Estimated 1RM trend from best work set per session.</p>
      </header>

      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel">
        <h2>History</h2>
        <p>
          Last 10 sessions: <strong>{summary.sessions.length}</strong>
        </p>
        <p>
          Best recent set:{' '}
          <strong>
            {summary.bestRecentSet
              ? `${formatNumber(summary.bestRecentSet.weight)} x ${summary.bestRecentSet.reps}`
              : 'No work sets yet'}
          </strong>
        </p>
        <p>
          Trend delta (estimated 1RM):{' '}
          <strong>
            {summary.trendDeltaOneRepMax > 0 ? '+' : ''}
            {formatNumber(summary.trendDeltaOneRepMax)} {settings.unit}
          </strong>
        </p>

        <div className="stack">
          {summary.sessions.length === 0 ? (
            <p>No completed sessions for this exercise yet.</p>
          ) : (
            summary.sessions.map((item) => (
              <article key={item.sessionId} className="list-card">
                <h3>{formatDateTime(item.endedAt)}</h3>
                <p>
                  Best set:{' '}
                  {item.bestSet
                    ? `${formatNumber(item.bestSet.weight)} x ${item.bestSet.reps}`
                    : 'No work sets'}
                </p>
                <p className="muted">
                  Estimated 1RM: {formatNumber(item.bestEstimatedOneRepMax)} {settings.unit}
                </p>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Progression settings</h2>
        <form className="stack" onSubmit={(event) => void handleSaveSettings(event)}>
          <label className="stack stack--tight">
            <span>Unit</span>
            <select
              value={settings.unit}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, unit: event.target.value as Unit } : current,
                )
              }
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>

          <label className="stack stack--tight">
            <span>repMin</span>
            <input
              type="number"
              min="1"
              value={settings.repMin}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        repMin: Math.max(1, Number(event.target.value) || 1),
                      }
                    : current,
                )
              }
            />
          </label>

          <label className="stack stack--tight">
            <span>repMax</span>
            <input
              type="number"
              min="1"
              value={settings.repMax}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        repMax: Math.max(1, Number(event.target.value) || 1),
                      }
                    : current,
                )
              }
            />
          </label>

          <label className="stack stack--tight">
            <span>workSetsTarget</span>
            <input
              type="number"
              min="1"
              value={settings.workSetsTarget}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        workSetsTarget: Math.max(1, Number(event.target.value) || 1),
                      }
                    : current,
                )
              }
            />
          </label>

          <label className="stack stack--tight">
            <span>weightIncrement</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={settings.weightIncrement}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        weightIncrement: Math.max(
                          0.1,
                          Number(event.target.value) || 0.1,
                        ),
                      }
                    : current,
                )
              }
            />
          </label>

          <button type="submit" className="button button--primary">
            Save progression settings
          </button>
        </form>
      </div>
    </section>
  )
}
