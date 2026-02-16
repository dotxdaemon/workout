import type { AppPreferences, Unit } from '../types'

const PREFERENCES_KEY = 'workout-tracker.preferences.v1'

export const defaultPreferences: AppPreferences = {
  defaultUnit: 'lb',
  restTimerEnabled: true,
  restSeconds: 90,
}

function isUnit(value: unknown): value is Unit {
  return value === 'lb' || value === 'kg'
}

export function readPreferences(): AppPreferences {
  const raw = localStorage.getItem(PREFERENCES_KEY)
  if (!raw) {
    return defaultPreferences
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    const defaultUnit = isUnit(parsed.defaultUnit)
      ? parsed.defaultUnit
      : defaultPreferences.defaultUnit
    const restTimerEnabled =
      typeof parsed.restTimerEnabled === 'boolean'
        ? parsed.restTimerEnabled
        : defaultPreferences.restTimerEnabled
    const restSeconds =
      typeof parsed.restSeconds === 'number' && Number.isFinite(parsed.restSeconds)
        ? Math.max(0, Math.round(parsed.restSeconds))
        : defaultPreferences.restSeconds

    return {
      defaultUnit,
      restTimerEnabled,
      restSeconds,
    }
  } catch {
    return defaultPreferences
  }
}

export function writePreferences(preferences: AppPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
}
