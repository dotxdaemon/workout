// ABOUTME: Derives lightweight workout-activity stats from completed set entries.
// ABOUTME: Used by the routines header to show streak and this-week training volume.
import { db } from './db'

export interface WeeklyStats {
  streak: number
  thisWeek: number
}

const dayMs = 24 * 60 * 60 * 1000

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export async function getWeeklyStats(now: Date = new Date()): Promise<WeeklyStats> {
  const entries = await db.setEntries.toArray()
  const dayKeys = new Set<string>()

  for (const entry of entries) {
    if (!entry.completedAt) {
      continue
    }
    const completed = new Date(entry.completedAt)
    if (Number.isNaN(completed.getTime())) {
      continue
    }
    dayKeys.add(localDateKey(completed))
  }

  const today = startOfLocalDay(now)
  let thisWeek = 0
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(today.getTime() - offset * dayMs)
    if (dayKeys.has(localDateKey(day))) {
      thisWeek += 1
    }
  }

  let streak = 0
  const start = dayKeys.has(localDateKey(today)) ? today : new Date(today.getTime() - dayMs)
  let cursor = start
  while (dayKeys.has(localDateKey(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - dayMs)
  }

  return { streak, thisWeek }
}
