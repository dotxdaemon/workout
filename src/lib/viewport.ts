// ABOUTME: Computes viewport-related layout metrics used by the mobile app shell.
// ABOUTME: Keeps shell height stable during keyboard-driven viewport transitions.
export function calculateViewportBottomOffset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
): number {
  const rawOffset =
    layoutViewportHeight - (visualViewportHeight + visualViewportOffsetTop)

  if (!Number.isFinite(rawOffset)) {
    return 0
  }

  return Math.round(rawOffset)
}

interface ShellHeightOptions {
  visualHeight: number
  visualOffsetTop: number
  innerHeight: number
  previousStableHeight: number
  isTextEditing: boolean
  keyboardThreshold: number
}

interface ShellHeightResult {
  shellHeight: number
  stableHeight: number
}

export function calculateShellHeight({
  visualHeight,
  visualOffsetTop,
  innerHeight,
  previousStableHeight,
  isTextEditing,
  keyboardThreshold,
}: ShellHeightOptions): ShellHeightResult {
  const safeVisualHeight = Number.isFinite(visualHeight) ? visualHeight : 0
  const safeVisualOffsetTop =
    Number.isFinite(visualOffsetTop) ? Math.max(0, visualOffsetTop) : 0
  const safeInnerHeight = Number.isFinite(innerHeight) ? Math.max(0, innerHeight) : 0
  const safePreviousStableHeight = Number.isFinite(previousStableHeight)
    ? Math.max(0, previousStableHeight)
    : 0
  const safeKeyboardThreshold = Number.isFinite(keyboardThreshold)
    ? Math.max(0, keyboardThreshold)
    : 0

  const candidate = Math.max(0, Math.round(safeVisualHeight + safeVisualOffsetTop))
  const stableCandidate = Math.max(candidate, Math.round(safeInnerHeight))
  const keyboardShrankViewport = candidate < safePreviousStableHeight - safeKeyboardThreshold

  if (isTextEditing && keyboardShrankViewport) {
    return {
      shellHeight: safePreviousStableHeight,
      stableHeight: safePreviousStableHeight,
    }
  }

  return {
    shellHeight: stableCandidate,
    stableHeight: stableCandidate,
  }
}
