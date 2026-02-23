// ABOUTME: Verifies localStorage persistence for active split selection and routine ids.
// ABOUTME: Ensures split switching does not overwrite saved routine choice from another split.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readActiveRoutineSplitId,
  readSelectedRoutineId,
  writeActiveRoutineSplitId,
  writeSelectedRoutineId,
} from './routineSelection'

describe('routineSelection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to 3 day split when no split has been selected', () => {
    expect(readActiveRoutineSplitId()).toBe('3-day-split')
  })

  it('persists selected routine id separately per split', () => {
    writeSelectedRoutineId('3-day-split', 'pull-routine-id')
    writeSelectedRoutineId('4-day-split', 'day-1-routine-id')

    expect(readSelectedRoutineId('3-day-split')).toBe('pull-routine-id')
    expect(readSelectedRoutineId('4-day-split')).toBe('day-1-routine-id')
  })

  it('stores the active split id for later visits', () => {
    writeActiveRoutineSplitId('4-day-split')
    expect(readActiveRoutineSplitId()).toBe('4-day-split')
  })
})
