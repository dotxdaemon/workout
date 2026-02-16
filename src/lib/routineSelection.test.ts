import { beforeEach, describe, expect, it } from 'vitest'
import {
  readSelectedRoutineId,
  writeSelectedRoutineId,
} from './routineSelection'

describe('routineSelection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty when nothing has been selected', () => {
    expect(readSelectedRoutineId()).toBe('')
  })

  it('persists selected routine id for later visits', () => {
    writeSelectedRoutineId('pull-routine-id')
    expect(readSelectedRoutineId()).toBe('pull-routine-id')
  })
})
