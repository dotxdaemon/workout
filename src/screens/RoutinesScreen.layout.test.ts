// ABOUTME: Verifies edit-mode layout invariants for routine action controls.
// ABOUTME: Prevents duplicate save-action affordances that confuse mobile UI.
/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('RoutinesScreen edit actions', () => {
  it('binds routine save action exactly once in edit mode', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')
    const matches = source.match(/onClick=\{\(\) => void handleSaveRoutineEdits\(\)\}/g) ?? []

    expect(matches).toHaveLength(1)
  })

  it('places split selection in edit mode settings row', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).toContain('Split type')
    expect(source).toContain('edit-split-row')
  })

  it('does not force switching to today mode when changing split type', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).not.toContain('setActiveSplitId(split.id)\n                setMode(\'today\')')
  })

  it('defines explicit day card state classes and today header anchor', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).toContain('day-button--completed')
    expect(source).toContain('day-button--upcoming')
    expect(source).toContain('today-active-day-header')
  })

  it('uses redesigned header and today input controls', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).toContain('routines-header__split')
    expect(source).toContain('pill-toggle')
    expect(source).toContain('today-input-row__timer')
  })

  it('defines dark theme tokens and bottom nav accent styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).toContain('--bg: #0D0D0F')
    expect(css).toContain('--accent: #C4B5FD')
    expect(css).toContain('.bottom-nav')
    expect(css).toContain('background: var(--bg)')
  })

  it('normalizes number textbox formatting and removes native spinner controls', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).toContain("input[type='number']")
    expect(css).toContain('appearance: textfield')
    expect(css).toContain("input[type='number']::-webkit-inner-spin-button")
    expect(css).toContain('-webkit-appearance: none')
  })

  it('locks viewport scaling and prevents horizontal overflow in today input rows', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(html).toContain('maximum-scale=1')
    expect(html).toContain('minimum-scale=1')
    expect(html).toContain('user-scalable=no')
    expect(css).toContain('.screen-area')
    expect(css).toContain('overflow-x: hidden')
    expect(css).toContain('touch-action: pan-y')
    expect(css).toContain('.page')
    expect(css).toContain('overflow-x: clip')
    expect(css).toContain('.compact-field')
    expect(css).toContain('min-width: 0')
    expect(css).toContain('.compact-field input')
    expect(css).toContain('width: 100%')
    expect(css).toContain('.today-input-row__timer')
    expect(css).toContain('max-width: 38px')
  })

  it('does not render Goal or Next in today card stats', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).not.toContain('<span className="today-card__stats-label">Next</span>')
    expect(source).not.toContain('<span className="today-card__stats-label">Goal</span>')
    expect(source).not.toContain('today-card__stats-next')
  })

  it('keeps edit mode focused on add/reorder/delete without advanced progression fields', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/screens/RoutinesScreen.tsx'), 'utf8')

    expect(source).toContain('Add exercise')
    expect(source).toContain('Delete')
    expect(source).toContain('↑')
    expect(source).toContain('↓')
    expect(source).not.toContain('<span>Unit</span>')
    expect(source).not.toContain('<span>Sets</span>')
    expect(source).not.toContain('Rep min')
    expect(source).not.toContain('Rep max')
    expect(source).not.toContain('Weight increment')
  })
})
