import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ensureCoreRoutines,
  getActiveSession,
  listRoutines,
  startSession,
} from '../lib/db'
import { formatDateTime } from '../lib/format'
import { readPreferences } from '../lib/preferences'
import type { Routine, SessionRecord } from '../types'

export function HomeScreen() {
  const navigate = useNavigate()
  const [activeSession, setActiveSession] = useState<SessionRecord>()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const preferences = readPreferences()
      await ensureCoreRoutines(preferences.defaultUnit)

      const [session, loadedRoutines] = await Promise.all([
        getActiveSession(),
        listRoutines(),
      ])

      setActiveSession(session)
      setRoutines(loadedRoutines)
      setError('')
    } catch {
      setError('Unable to load workout data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quickRoutineCards = useMemo(() => {
    const routineByName = new Map(routines.map((routine) => [routine.name.toLowerCase(), routine]))

    return ['push', 'pull', 'legs']
      .map((name) => routineByName.get(name))
      .filter((routine): routine is Routine => Boolean(routine))
      .map((routine) => ({
        ...routine,
        exerciseCount: routine.exerciseIds.length,
      }))
  }, [routines])

  const routineById = useMemo(
    () => new Map(routines.map((routine) => [routine.id, routine])),
    [routines],
  )

  async function handleStartSession(routineId?: string): Promise<void> {
    if (activeSession) {
      navigate(`/session/${activeSession.id}`)
      return
    }

    const session = await startSession(routineId)
    navigate(`/session/${session.id}`)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Workout</h1>
        <p>Pick Push, Pull, or Legs and log your weight fast.</p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel">
        <h2>{activeSession ? 'Current session' : 'Pick today'}</h2>
        {activeSession ? (
          <>
            <p>Started {formatDateTime(activeSession.startedAt)}</p>
            {activeSession.routineId ? (
              <p className="muted">
                Day: {routineById.get(activeSession.routineId)?.name ?? 'Routine'}
              </p>
            ) : null}
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate(`/session/${activeSession.id}`)}
            >
              Resume session
            </button>
          </>
        ) : (
          <>
            <p className="muted">Tap one.</p>
            <div className="day-picker">
              {quickRoutineCards.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  className="day-button"
                  onClick={() => void handleStartSession(routine.id)}
                >
                  <span>{routine.name}</span>
                  <small>{routine.exerciseCount} exercises</small>
                </button>
              ))}
            </div>
            <button type="button" className="button" onClick={() => void handleStartSession()}>
              Quick blank session
            </button>
            {quickRoutineCards.length < 3 ? (
              <p className="muted">Loading your Push / Pull / Legs setup...</p>
            ) : null}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Edit split</h2>
        <p className="muted">
          Change routine exercises or defaults when needed.
        </p>
        <div className="button-row">
          <Link className="button" to="/routines">
            Edit Push / Pull / Legs
          </Link>
          <Link className="button" to="/settings">
            Settings
          </Link>
        </div>
        {isLoading ? <p className="muted">Loading...</p> : null}
      </div>
    </section>
  )
}
