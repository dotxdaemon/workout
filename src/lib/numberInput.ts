// ABOUTME: Pure helpers for parsing and quick-adjusting numeric set-entry inputs.
// ABOUTME: Keeps weight/reps math out of UI components so it can be unit-tested directly.

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

export function weightChipDeltas(increment: number): number[] {
  if (!Number.isFinite(increment) || increment <= 0) {
    return []
  }
  const half = Math.round((increment / 2) * 100) / 100
  const raises = [half, increment, increment * 2].filter(
    (delta, index, all) => delta > 0 && all.indexOf(delta) === index,
  )
  return [-increment, ...raises]
}

export function applyWeightDelta(current: string, delta: number): string {
  const next = Math.max(0, Math.round((parseNumber(current) + delta) * 100) / 100)
  if (next <= 0) {
    return ''
  }
  return String(next)
}
