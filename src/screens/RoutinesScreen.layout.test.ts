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
})
