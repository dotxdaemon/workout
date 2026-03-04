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
}

interface AdvanceShellHeightStateInput {
  visualHeight: number
  visualOffsetTop: number
  innerHeight: number
  keyboardThreshold: number
  recoveryEpsilon: number
  requiredRecoveryPasses: number
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
    keyboardThreshold,
    recoveryEpsilon,
    requiredRecoveryPasses,
  }: AdvanceShellHeightStateInput,
  state: ShellHeightState,
): AdvanceShellHeightStateResult {
  const safeVisualHeight = Number.isFinite(visualHeight) ? visualHeight : 0
  const safeVisualOffsetTop =
    Number.isFinite(visualOffsetTop) ? Math.max(0, visualOffsetTop) : 0
  const safeInnerHeight = Number.isFinite(innerHeight) ? Math.max(0, innerHeight) : 0
  const safeKeyboardThreshold = Number.isFinite(keyboardThreshold)
    ? Math.max(0, keyboardThreshold)
    : 0
  const safeRecoveryEpsilon = Number.isFinite(recoveryEpsilon) ? Math.max(0, recoveryEpsilon) : 0
  const safeRequiredRecoveryPasses = Number.isFinite(requiredRecoveryPasses)
    ? Math.max(1, Math.round(requiredRecoveryPasses))
    : 1

  const nextState: ShellHeightState = {
    stableHeight: Number.isFinite(state.stableHeight) ? Math.max(0, state.stableHeight) : 0,
    isEditing: Boolean(state.isEditing),
    isBlurTransitionActive: Boolean(state.isBlurTransitionActive),
    recoveryPasses: Number.isFinite(state.recoveryPasses)
      ? Math.max(0, Math.round(state.recoveryPasses))
      : 0,
  }

  const candidate = Math.max(0, Math.round(safeVisualHeight + safeVisualOffsetTop))
  const stableCandidate = Math.max(candidate, Math.round(safeInnerHeight))
  const keyboardShrankViewport = candidate < nextState.stableHeight - safeKeyboardThreshold

  if (nextState.isEditing && keyboardShrankViewport) {
    nextState.recoveryPasses = 0
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  if (!nextState.isBlurTransitionActive) {
    nextState.stableHeight = stableCandidate
    nextState.recoveryPasses = 0
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  if (keyboardShrankViewport) {
    nextState.recoveryPasses = 0
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  const isStrongRecoveryTick = candidate >= nextState.stableHeight + safeKeyboardThreshold
  if (isStrongRecoveryTick) {
    nextState.stableHeight = stableCandidate
    nextState.isBlurTransitionActive = false
    nextState.recoveryPasses = 0
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  const isRecoveredTick = candidate >= nextState.stableHeight - safeRecoveryEpsilon
  if (!isRecoveredTick) {
    nextState.recoveryPasses = 0
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  nextState.recoveryPasses += 1
  if (nextState.recoveryPasses < safeRequiredRecoveryPasses) {
    return {
      shellHeight: nextState.stableHeight,
      state: nextState,
    }
  }

  nextState.stableHeight = stableCandidate
  nextState.isBlurTransitionActive = false
  nextState.recoveryPasses = 0

  return {
    shellHeight: nextState.stableHeight,
    state: nextState,
  }
}
