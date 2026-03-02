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
})
