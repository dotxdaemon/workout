// ABOUTME: Reads and writes local user preferences used for defaults across workout entry.
// ABOUTME: Applies safe fallbacks so malformed local storage never breaks the UI.
import type { AppPreferences, ThemeMode, Unit } from '../types'

const PREFERENCES_KEY = 'workout-tracker.preferences.v1'

export const defaultPreferences: AppPreferences = {
  defaultUnit: 'lb',
  defaultWeightIncrement: 5,
  restTimerEnabled: true,
  restSeconds: 90,
  theme: 'dark',
}

function isUnit(value: unknown): value is Unit {
  return value === 'lb' || value === 'kg'
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme)
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
    const defaultWeightIncrement =
      typeof parsed.defaultWeightIncrement === 'number' &&
      Number.isFinite(parsed.defaultWeightIncrement)
        ? Math.max(0.1, Number(parsed.defaultWeightIncrement))
        : defaultPreferences.defaultWeightIncrement
    const restTimerEnabled =
      typeof parsed.restTimerEnabled === 'boolean'
        ? parsed.restTimerEnabled
        : defaultPreferences.restTimerEnabled
    const restSeconds =
      typeof parsed.restSeconds === 'number' && Number.isFinite(parsed.restSeconds)
        ? Math.max(0, Math.round(parsed.restSeconds))
        : defaultPreferences.restSeconds
    const theme = isThemeMode(parsed.theme) ? parsed.theme : defaultPreferences.theme

    return {
      defaultUnit,
      defaultWeightIncrement,
      restTimerEnabled,
      restSeconds,
      theme,
    }
  } catch {
    return defaultPreferences
  }
}

export function writePreferences(preferences: AppPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  applyTheme(preferences.theme)
}
