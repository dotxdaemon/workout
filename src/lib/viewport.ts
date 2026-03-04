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

export interface ShellHeightState {
  stableHeight: number
  isEditing: boolean
  isBlurTransitionActive: boolean
  recoveryPasses: number
  lastViewportWidth: number
  lastViewportHeight: number
}

interface AdvanceShellHeightStateInput {
  visualHeight: number
  visualOffsetTop: number
  innerHeight: number
  innerWidth: number
  keyboardThreshold: number
  recoveryEpsilon: number
  requiredRecoveryPasses: number
  orientationWidthDeltaThreshold: number
}

interface AdvanceShellHeightStateResult {
  shellHeight: number
  state: ShellHeightState
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

export function advanceShellHeightState(
  {
    visualHeight,
    visualOffsetTop,
    innerHeight,
    innerWidth,
    keyboardThreshold,
    recoveryEpsilon,
    requiredRecoveryPasses,
    orientationWidthDeltaThreshold,
  }: AdvanceShellHeightStateInput,
  state: ShellHeightState,
): AdvanceShellHeightStateResult {
  const safeVisualHeight = Number.isFinite(visualHeight) ? visualHeight : 0
  const safeVisualOffsetTop =
    Number.isFinite(visualOffsetTop) ? Math.max(0, visualOffsetTop) : 0
  const safeInnerHeight = Number.isFinite(innerHeight) ? Math.max(0, innerHeight) : 0
  const safeInnerWidth = Number.isFinite(innerWidth) ? Math.max(0, innerWidth) : 0
  const safeKeyboardThreshold = Number.isFinite(keyboardThreshold)
    ? Math.max(0, keyboardThreshold)
    : 0
  const safeRecoveryEpsilon = Number.isFinite(recoveryEpsilon) ? Math.max(0, recoveryEpsilon) : 0
  const safeRequiredRecoveryPasses = Number.isFinite(requiredRecoveryPasses)
    ? Math.max(1, Math.round(requiredRecoveryPasses))
    : 1
  const safeOrientationWidthDeltaThreshold = Number.isFinite(orientationWidthDeltaThreshold)
    ? Math.max(0, orientationWidthDeltaThreshold)
    : 0

  const nextState: ShellHeightState = {
    stableHeight: Number.isFinite(state.stableHeight) ? Math.max(0, state.stableHeight) : 0,
    isEditing: Boolean(state.isEditing),
    isBlurTransitionActive: Boolean(state.isBlurTransitionActive),
    recoveryPasses: Number.isFinite(state.recoveryPasses)
      ? Math.max(0, Math.round(state.recoveryPasses))
      : 0,
    lastViewportWidth: Number.isFinite(state.lastViewportWidth)
      ? Math.max(0, Math.round(state.lastViewportWidth))
      : 0,
    lastViewportHeight: Number.isFinite(state.lastViewportHeight)
      ? Math.max(0, Math.round(state.lastViewportHeight))
      : 0,
  }

  const candidate = Math.max(0, Math.round(safeVisualHeight + safeVisualOffsetTop))
  const stableCandidate = Math.max(candidate, Math.round(safeInnerHeight))
  const keyboardShrankViewport = candidate < nextState.stableHeight - safeKeyboardThreshold
  const hasPreviousViewport = nextState.lastViewportWidth > 0 && nextState.lastViewportHeight > 0
  const widthShifted =
    hasPreviousViewport &&
    Math.abs(safeInnerWidth - nextState.lastViewportWidth) >= safeOrientationWidthDeltaThreshold
  const aspectFlipped =
    hasPreviousViewport &&
    (nextState.lastViewportWidth > nextState.lastViewportHeight) !==
      (safeInnerWidth > safeInnerHeight)
  const shouldRebaseStableHeight = widthShifted || aspectFlipped

  const finalize = (shellHeight: number): AdvanceShellHeightStateResult => {
    nextState.lastViewportWidth = Math.round(safeInnerWidth)
    nextState.lastViewportHeight = Math.round(safeInnerHeight)
    return {
      shellHeight,
      state: nextState,
    }
  }

  if (shouldRebaseStableHeight) {
    nextState.stableHeight = stableCandidate
    nextState.isBlurTransitionActive = false
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  if (nextState.isEditing && keyboardShrankViewport) {
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  if (!nextState.isBlurTransitionActive) {
    nextState.stableHeight = Math.max(nextState.stableHeight, stableCandidate)
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  if (keyboardShrankViewport) {
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  const isStrongRecoveryTick = candidate >= nextState.stableHeight + safeKeyboardThreshold
  if (isStrongRecoveryTick) {
    nextState.stableHeight = stableCandidate
    nextState.isBlurTransitionActive = false
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  const isRecoveredTick = candidate >= nextState.stableHeight - safeRecoveryEpsilon
  if (!isRecoveredTick) {
    nextState.recoveryPasses = 0
    return finalize(nextState.stableHeight)
  }

  nextState.recoveryPasses += 1
  if (nextState.recoveryPasses < safeRequiredRecoveryPasses) {
    return finalize(nextState.stableHeight)
  }

  nextState.stableHeight = stableCandidate
  nextState.isBlurTransitionActive = false
  nextState.recoveryPasses = 0

  return finalize(nextState.stableHeight)
}
