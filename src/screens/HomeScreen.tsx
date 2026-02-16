import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getActiveSession,
  listExercises,
  listRoutines,
  startSession,
} from '../lib/db'
import { formatDateTime } from '../lib/format'
import type { Exercise, Routine, SessionRecord } from '../types'

export function HomeScreen() {
  const navigate = useNavigate()
  const [activeSession, setActiveSession] = useState<SessionRecord>()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [session, loadedRoutines, exercises] = await Promise.all([
        getActiveSession(),
        listRoutines(),
        listExercises(),
      ])

      setActiveSession(session)
      setRoutines(loadedRoutines)
      setExerciseMap(Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])))
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

  const routineCards = useMemo(
    () =>
      routines.map((routine) => {
        const exerciseCount = routine.exerciseIds.length
        const preview = routine.exerciseIds
          .slice(0, 3)
          .map((exerciseId) => exerciseMap[exerciseId]?.name)
          .filter((name): name is string => Boolean(name))
          .join(', ')

        return {
          ...routine,
          exerciseCount,
          preview,
        }
      }),
    [exerciseMap, routines],
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
        <h1>Workout Tracker</h1>
        <p>Fast set logging, offline, no accounts.</p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="panel">
        <h2>Current session</h2>
        {activeSession ? (
          <>
            <p>Started {formatDateTime(activeSession.startedAt)}</p>
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
            <p>No active session.</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void handleStartSession()}
            >
              Quick start blank session
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <div className="row row--between">
          <h2>Routines</h2>
          <Link className="text-link" to="/routines">
            Manage
          </Link>
        </div>

        {isLoading ? <p>Loading routines...</p> : null}

        {routineCards.length === 0 && !isLoading ? (
          <p>Create your first routine to speed up starts.</p>
        ) : null}

        {routineCards.map((routine) => (
          <article key={routine.id} className="list-card">
            <h3>{routine.name}</h3>
            <p>
              {routine.exerciseCount} exercise{routine.exerciseCount === 1 ? '' : 's'}
            </p>
            {routine.preview ? <p className="muted">{routine.preview}</p> : null}
            <button
              type="button"
              className="button"
              onClick={() => void handleStartSession(routine.id)}
            >
              {activeSession ? 'Resume current session' : 'Start routine'}
            </button>
          </article>
        ))}
      </div>

      <div className="panel">
        <h2>Exercises</h2>
        {Object.values(exerciseMap).length === 0 ? (
          <p>Exercises appear here once you create them in Routines.</p>
        ) : (
          <div className="stack">
            {Object.values(exerciseMap)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((exercise) => (
                <Link
                  key={exercise.id}
                  to={`/exercise/${exercise.id}`}
                  className="button button--ghost"
                >
                  {exercise.name}
                </Link>
              ))}
          </div>
        )}
      </div>
    </section>
  )
}
