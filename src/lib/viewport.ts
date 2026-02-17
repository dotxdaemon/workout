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
