// ABOUTME: Provides drag math for the history bottom sheet gesture interactions.
// ABOUTME: Keeps touch-close rules small and testable outside of React components.
const HISTORY_SHEET_CLOSE_THRESHOLD = 96

export function shouldAllowHistorySheetDrag(startScrollTop: number, deltaY: number): boolean {
  return startScrollTop <= 0 && deltaY > 0
}

export function getHistorySheetDragOffset(startY: number, currentY: number): number {
  const delta = currentY - startY

  if (!Number.isFinite(delta) || delta <= 0) {
    return 0
  }

  return delta
}

export function shouldCloseHistorySheetAfterDrag(
  dragOffset: number,
  closeThreshold = HISTORY_SHEET_CLOSE_THRESHOLD,
): boolean {
  if (!Number.isFinite(dragOffset)) {
    return false
  }

  return dragOffset >= closeThreshold
}
