// ABOUTME: Unit tests for the readable text-log backup builder.
// ABOUTME: Confirms it lists every set and rep and handles an empty database gracefully.
import { describe, expect, it } from 'vitest'
import { buildTextLog } from './textLog'
import { defaultProgressionSettings } from './db'
import type { AppPreferences, WorkoutExport } from '../types'

const preferences: AppPreferences = {
  defaultUnit: 'lb',
  defaultWeightIncrement: 5,
  restTimerEnabled: true,
  restSeconds: 90,
  theme: 'dark',
}

const generatedAt = '2026-06-17T12:00:00.000Z'

function buildData(): WorkoutExport['data'] {
  return {
    exercises: [
      {
        id: 'ex-1',
        name: 'Back Squat',
        unitDefault: 'lb',
        progressionSettings: defaultProgressionSettings('lb'),
      },
    ],
    routines: [],
    sessions: [
      {
        id: 'session-1',
        startedAt: '2026-06-10T17:00:00.000Z',
        endedAt: '2026-06-10T18:00:00.000Z',
      },
    ],
    setEntries: [
      {
        id: 'set-1',
        sessionId: 'session-1',
        exerciseId: 'ex-1',
        index: 0,
        weight: 225,
        reps: 5,
        isWarmup: false,
        completedAt: '2026-06-10T17:05:00.000Z',
      },
      {
        id: 'set-2',
        sessionId: 'session-1',
        exerciseId: 'ex-1',
        index: 1,
        weight: 135,
        reps: 8,
        isWarmup: true,
        completedAt: '2026-06-10T17:02:00.000Z',
      },
    ],
  }
}

describe('buildTextLog', () => {
  it('lists every set and rep grouped by session', () => {
    const text = buildTextLog(buildData(), preferences, generatedAt)

    expect(text).toContain('WORKOUT LOG BACKUP')
    expect(text).toContain('Sessions with sets: 1')
    expect(text).toContain('Total sets logged: 2')
    expect(text).toContain('Back Squat')
    expect(text).toContain('225 lb x 5')
    expect(text).toContain('135 lb x 8 (warmup)')
  })

  it('handles an empty database without throwing', () => {
    const text = buildTextLog(
      { exercises: [], routines: [], sessions: [], setEntries: [] },
      preferences,
      generatedAt,
    )

    expect(text).toContain('No sets have been logged yet.')
    expect(text).toContain('Total sets logged: 0')
  })

  it('keeps each recorded unit and labels suggested sets as not completed', () => {
    const data = buildData()
    data.exercises[0].progressionSettings.unit = 'kg'
    data.setEntries[0].unit = 'lb'
    data.setEntries[1].unit = 'kg'
    data.setEntries[1].completedAt = undefined
    const text = buildTextLog(data, preferences, generatedAt)
    expect(text).toContain('225 lb x 5')
    expect(text).toContain('135 kg x 8 (warmup) (not completed)')
  })

  it('orders session dates by their actual time when recorded offsets differ', () => {
    const data = buildData()
    data.setEntries[0].completedAt = '2026-09-22T12:00:00+02:00'
    data.setEntries[1].completedAt = '2026-09-22T09:00:00-02:00'
    data.sessions.push({
      id: 'session-2',
      startedAt: '2026-09-22T12:00:00+02:00',
      endedAt: '2026-09-22T13:00:00+02:00',
    })
    data.setEntries.push({
      ...data.setEntries[0],
      id: 'set-3',
      sessionId: 'session-2',
      weight: 315,
      completedAt: '2026-09-22T12:30:00+02:00',
    })
    const text = buildTextLog(data, preferences, generatedAt)
    expect(text.indexOf('225 lb x 5')).toBeLessThan(text.indexOf('315 lb x 5'))
  })
})
