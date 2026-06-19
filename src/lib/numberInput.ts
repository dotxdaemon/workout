// ABOUTME: Pure helpers for parsing and stepping numeric set-entry inputs.
// ABOUTME: Keeps weight/reps math out of UI components so it can be unit-tested directly.
import { formatNumber } from './format'

export function parseNumber(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }
  return numeric
}

export function parseReps(value: string): number {
  return Math.round(parseNumber(value))
}

interface StepOptions {
  step: number
  direction: -1 | 1
  integer?: boolean
}

export function stepValue(current: string, { step, direction, integer }: StepOptions): string {
  const base = integer ? parseReps(current) : parseNumber(current)
  const next = Math.max(0, base + step * direction)
  if (next <= 0) {
    return ''
  }
  return integer ? String(Math.round(next)) : formatNumber(next)
}
