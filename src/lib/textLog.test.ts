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
      { id: 'session-1', startedAt: '2026-06-10T17:00:00.000Z', endedAt: '2026-06-10T18:00:00.000Z' },
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
})
