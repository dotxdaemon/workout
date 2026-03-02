// ABOUTME: Provides drag math for the history bottom sheet gesture interactions.
// ABOUTME: Keeps touch-close rules small and testable outside of React components.
const HISTORY_SHEET_CLOSE_THRESHOLD = 96
const HISTORY_SHEET_BACKDROP_GUARD_MS = 180

interface OverlayLockTargets {
  screenArea: HTMLElement | null
  bottomNav: HTMLElement | null
}

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

export function shouldIgnoreHistorySheetBackdropClose(
  openedAtMs: number,
  nowMs: number,
  guardMs = HISTORY_SHEET_BACKDROP_GUARD_MS,
): boolean {
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(nowMs)) {
    return false
  }

  const elapsed = nowMs - openedAtMs
  return elapsed >= 0 && elapsed < guardMs
}

export function applyHistorySheetOverlayLock(
  screenArea: OverlayLockTargets['screenArea'],
  bottomNav: OverlayLockTargets['bottomNav'],
): () => void {
  const previousBodyOverflow = document.body.style.overflow
  const previousScreenAreaOverflow = screenArea?.style.overflow ?? ''
  const previousScreenAreaTouchAction = screenArea?.style.touchAction ?? ''
  const previousBottomNavVisibility = bottomNav?.style.visibility ?? ''
  const previousBottomNavPointerEvents = bottomNav?.style.pointerEvents ?? ''

  document.body.style.overflow = 'hidden'

  if (screenArea) {
    screenArea.style.overflow = 'hidden'
    screenArea.style.touchAction = 'none'
  }

  if (bottomNav) {
    bottomNav.style.visibility = 'hidden'
    bottomNav.style.pointerEvents = 'none'
  }

  return () => {
    document.body.style.overflow = previousBodyOverflow

    if (screenArea) {
      screenArea.style.overflow = previousScreenAreaOverflow
      screenArea.style.touchAction = previousScreenAreaTouchAction
    }

    if (bottomNav) {
      bottomNav.style.visibility = previousBottomNavVisibility
      bottomNav.style.pointerEvents = previousBottomNavPointerEvents
    }
  }
}
