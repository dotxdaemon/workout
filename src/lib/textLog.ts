// ABOUTME: Builds a human-readable plain-text log of every session, set, and rep count.
// ABOUTME: Backs the Settings "Export log" action and on-disk backups of the workout history.
import { readFullExportData } from './db'
import { formatNumber } from './format'
import type { AppPreferences, Exercise, SessionRecord, SetEntry, WorkoutExport } from '../types'

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function sessionSortKey(session: SessionRecord, sets: SetEntry[]): string {
  const completed = sets
    .map((set) => set.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))
  return completed[0] ?? session.endedAt ?? session.startedAt
}

export function buildTextLog(
  data: WorkoutExport['data'],
  preferences: AppPreferences,
  generatedAt: string,
): string {
  const exerciseById = new Map<string, Exercise>(
    data.exercises.map((exercise) => [exercise.id, exercise]),
  )
  const setsBySession = new Map<string, SetEntry[]>()
  for (const entry of data.setEntries) {
    const list = setsBySession.get(entry.sessionId) ?? []
    list.push(entry)
    setsBySession.set(entry.sessionId, list)
  }

  const sessions = [...data.sessions]
    .map((session) => ({ session, sets: setsBySession.get(session.id) ?? [] }))
    .filter((item) => item.sets.length > 0)
    .sort((a, b) => sessionSortKey(b.session, b.sets).localeCompare(sessionSortKey(a.session, a.sets)))

  const lines: string[] = []
  lines.push('WORKOUT LOG BACKUP')
  lines.push(`Generated: ${formatTimestamp(generatedAt)}`)
  lines.push(
    `Sessions with sets: ${sessions.length}  |  Total sets logged: ${data.setEntries.length}  |  Default unit: ${preferences.defaultUnit}`,
  )
  lines.push('='.repeat(56))

  if (sessions.length === 0) {
    lines.push('')
    lines.push('No sets have been logged yet.')
    lines.push('')
    return `${lines.join('\n')}\n`
  }

  for (const { session, sets } of sessions) {
    const sortKey = sessionSortKey(session, sets)
    lines.push('')
    lines.push(formatTimestamp(sortKey))
    lines.push('-'.repeat(40))

    const byExercise = new Map<string, SetEntry[]>()
    for (const set of sets) {
      const list = byExercise.get(set.exerciseId) ?? []
      list.push(set)
      byExercise.set(set.exerciseId, list)
    }

    for (const [exerciseId, exerciseSets] of byExercise) {
      const exercise = exerciseById.get(exerciseId)
      const name = exercise?.name ?? 'Unknown exercise'
      const unit = exercise?.progressionSettings.unit ?? preferences.defaultUnit
      const ordered = [...exerciseSets].sort((a, b) => a.index - b.index)
      const formattedSets = ordered.map((set) => {
        const label = `${formatNumber(set.weight)} ${unit} x ${set.reps}`
        return set.isWarmup ? `${label} (warmup)` : label
      })
      lines.push(`  ${name}`)
      for (let index = 0; index < formattedSets.length; index += 1) {
        lines.push(`    Set ${index + 1}: ${formattedSets[index]}`)
      }
    }
  }

  lines.push('')
  return `${lines.join('\n')}\n`
}

export async function buildTextLogExport(
  preferences: AppPreferences,
  generatedAt: string = new Date().toISOString(),
): Promise<string> {
  const data = await readFullExportData()
  return buildTextLog(data, preferences, generatedAt)
}
