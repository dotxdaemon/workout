import { describe, expect, it } from 'vitest'
import {
  advanceShellHeightState,
  calculateShellHeight,
  calculateViewportBottomOffset,
} from './viewport'

describe('calculateViewportBottomOffset', () => {
  it('returns zero when visual viewport matches layout viewport', () => {
    expect(calculateViewportBottomOffset(812, 812, 0)).toBe(0)
  })

  it('returns a negative offset when visual viewport is pulled down', () => {
    expect(calculateViewportBottomOffset(812, 812, 96)).toBe(-96)
  })

  it('returns keyboard offset when visual viewport shrinks', () => {
    expect(calculateViewportBottomOffset(812, 500, 0)).toBe(312)
  })

  it('clamps non-finite offsets to zero', () => {
    expect(calculateViewportBottomOffset(Number.NaN, 900, 0)).toBe(0)
  })
})

describe('calculateShellHeight', () => {
  it('includes visual viewport offset when not editing text', () => {
    const result = calculateShellHeight({
      visualHeight: 700,
      visualOffsetTop: 120,
      innerHeight: 700,
      previousStableHeight: 700,
      isTextEditing: false,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })

  it('freezes shell height while editing and keyboard shrink is detected', () => {
    const result = calculateShellHeight({
      visualHeight: 500,
      visualOffsetTop: 0,
      innerHeight: 700,
      previousStableHeight: 820,
      isTextEditing: true,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })

  it('returns normalized shell height after editing ends', () => {
    const result = calculateShellHeight({
      visualHeight: 700,
      visualOffsetTop: 120,
      innerHeight: 700,
      previousStableHeight: 820,
      isTextEditing: false,
      keyboardThreshold: 100,
    })

    expect(result.shellHeight).toBe(820)
    expect(result.stableHeight).toBe(820)
  })
})

describe('advanceShellHeightState', () => {
  it('keeps stable shell height while blur transition is active and viewport stays shrunken', () => {
    const first = advanceShellHeightState(
      {
        visualHeight: 500,
        visualOffsetTop: 0,
        innerHeight: 500,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(first.shellHeight).toBe(700)
    expect(first.state.isBlurTransitionActive).toBe(true)
    expect(first.state.recoveryPasses).toBe(0)
  })

  it('exits blur transition only after two recovered ticks', () => {
    const first = advanceShellHeightState(
      {
        visualHeight: 699,
        visualOffsetTop: 1,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(first.state.isBlurTransitionActive).toBe(true)
    expect(first.state.recoveryPasses).toBe(1)
    expect(first.shellHeight).toBe(700)

    const second = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      first.state,
    )

    expect(second.state.isBlurTransitionActive).toBe(false)
    expect(second.state.recoveryPasses).toBe(0)
    expect(second.shellHeight).toBe(820)
  })

  it('exits blur transition on one strong recovery tick', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: true,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.state.isBlurTransitionActive).toBe(false)
    expect(result.state.recoveryPasses).toBe(0)
    expect(result.shellHeight).toBe(820)
  })

  it('updates stable height in normal non-blur mode', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 700,
        visualOffsetTop: 120,
        innerHeight: 700,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 700,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
    expect(result.state.isBlurTransitionActive).toBe(false)
  })

  it('does not shrink shell in normal mode when viewport briefly reports smaller height', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 640,
        visualOffsetTop: 0,
        innerHeight: 640,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase stable height from width shifts alone in portrait', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 640,
        visualOffsetTop: 0,
        innerHeight: 640,
        innerWidth: 520,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase while editing when keyboard shrink makes height smaller than width', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 320,
        visualOffsetTop: 0,
        innerHeight: 320,
        innerWidth: 390,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: true,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })

  it('does not rebase stable height from aspect flips without explicit orientation reset', () => {
    const result = advanceShellHeightState(
      {
        visualHeight: 390,
        visualOffsetTop: 0,
        innerHeight: 390,
        innerWidth: 844,
        keyboardThreshold: 100,
        recoveryEpsilon: 2,
        requiredRecoveryPasses: 2,
      },
      {
        stableHeight: 820,
        isEditing: false,
        isBlurTransitionActive: false,
        recoveryPasses: 0,
        lastViewportWidth: 390,
        lastViewportHeight: 844,
      },
    )

    expect(result.shellHeight).toBe(820)
    expect(result.state.stableHeight).toBe(820)
  })
})
