// ABOUTME: Tests workout draft recovery and durable correction saving against IndexedDB.
// ABOUTME: Covers pending navigation, concurrent input, and distinct unfinished set values.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Exercise, SetEntry } from '../types'
import { WorkoutExercise } from './WorkoutExercise'

const exercise: Exercise = {
  id: 'exercise',
  name: 'Press',
  unitDefault: 'lb',
  progressionSettings: {
    unit: 'lb',
    repMin: 8,
    repMax: 12,
    workSetsTarget: 3,
    weightIncrement: 5,
  },
}
const completedSet: SetEntry = {
  id: 'completed-set',
  sessionId: 'session',
  exerciseId: exercise.id,
  index: 0,
  weight: 100,
  reps: 8,
  unit: 'lb',
  isWarmup: false,
  completedAt: '2026-09-22T18:00:00.000Z',
}
const storageKey = 'workout-tracker.entry.session.exercise'

describe('WorkoutExercise saving', () => {
  let host: HTMLDivElement
  let root: Root | undefined
  let busy: boolean[]

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    localStorage.clear()
    busy = []
    host = document.createElement('div')
    document.body.append(host)
    await db.setEntries.clear()
    await db.sessions.clear()
    await db.exercises.clear()
    await db.exercises.put(exercise)
    await db.sessions.put({ id: 'session', startedAt: '2026-09-22T18:00:00.000Z' })
    await db.setEntries.put(completedSet)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = undefined
    host.remove()
    localStorage.clear()
    await db.setEntries.clear()
    await db.sessions.clear()
    await db.exercises.clear()
  })

  async function render(
    sets: SetEntry[] = [completedSet],
    previous = false,
  ): Promise<void> {
    function Harness() {
      const [entries, setEntries] = useState(sets)
      return (
        <WorkoutExercise
          exercise={exercise}
          sessionId="session"
          isExpanded
          onToggle={() => undefined}
          sets={entries}
          onChanged={setEntries}
          lastSession={
            previous
              ? {
                  session: {
                    id: 'previous',
                    startedAt: '2026-09-21T18:00:00.000Z',
                    endedAt: '2026-09-21T19:00:00.000Z',
                  },
                  sets: [completedSet],
                }
              : undefined
          }
          onBusy={(value) => busy.push(value)}
          onOpenHistory={() => undefined}
          onRemoveExercise={() => undefined}
        />
      )
    }
    root = createRoot(host)
    await act(async () => root!.render(<Harness />))
  }

  const reps = () => host.querySelector<HTMLInputElement>('[inputmode="numeric"]')!
  const weight = () => host.querySelector<HTMLInputElement>('[inputmode="decimal"]')!
  const button = (name: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === name)!
  const selectCompleted = async () =>
    click(host.querySelector('[aria-label="Edit set 1 for Press"]')!)

  it('keeps guidance and management behind an accessible Options disclosure', async () => {
    await render([], true)
    expect(host.querySelector('.exercise-card__position')).toBeNull()
    expect(host.querySelector('.suggestion')).toBeNull()
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.querySelector('[aria-label="Open history for Press"]')).not.toBeNull()
    const options = button('Options')
    expect(options.getAttribute('aria-expanded')).toBe('false')
    await click(options)
    expect(options.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.suggestion')?.textContent).toBeTruthy()
    expect(host.querySelector('textarea')).not.toBeNull()
    expect(button('Remove from this workout')).toBeDefined()
    await click(options)
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.querySelector('.suggestion')).toBeNull()
  })

  it('adjusts draft reps by one without completing a set and stops at zero', async () => {
    await db.setEntries.clear()
    await render([])
    const increase = host.querySelector<HTMLButtonElement>(
      '[aria-label="Increase reps for Press"]',
    )
    const decrease = host.querySelector<HTMLButtonElement>(
      '[aria-label="Decrease reps for Press"]',
    )
    expect(increase).not.toBeNull()
    expect(decrease).not.toBeNull()
    expect(decrease!.disabled).toBe(true)
    await click(increase!)
    expect(reps().value).toBe('1')
    await act(async () => {
      increase!.click()
      increase!.click()
    })
    expect(reps().value).toBe('3')
    await click(decrease!)
    expect(reps().value).toBe('2')
    await change(reps(), '0')
    expect(decrease!.disabled).toBe(true)
    await change(reps(), '1.5')
    expect(increase!.disabled).toBe(true)
    expect(decrease!.disabled).toBe(true)
    expect(reps().value).toBe('1.5')
    expect(await db.setEntries.count()).toBe(0)
  })

  it('autosaves rep stepper corrections on the same completed set', async () => {
    await render()
    await selectCompleted()
    const increase = host.querySelector<HTMLButtonElement>(
      '[aria-label="Increase reps for Press"]',
    )
    const decrease = host.querySelector<HTMLButtonElement>(
      '[aria-label="Decrease reps for Press"]',
    )
    expect(increase).not.toBeNull()
    expect(decrease).not.toBeNull()
    await click(increase!)
    expect(reps().value).toBe('9')
    expect(busy.at(-1)).toBe(true)
    await waitUntil(async () => (await db.setEntries.get(completedSet.id))?.reps === 9)
    await click(decrease!)
    expect(reps().value).toBe('8')
    await waitUntil(async () => busy.at(-1) === false)
    expect(await db.setEntries.toArray()).toEqual([completedSet])
  })

  it('marks a correction pending before the autosave debounce can allow finishing', async () => {
    await render()
    await selectCompleted()
    await change(reps(), '9')
    expect(busy.at(-1)).toBe(true)
    expect(host.textContent).not.toContain('Saved on this device')
    await waitUntil(async () => (await db.setEntries.get(completedSet.id))?.reps === 9)
    await waitUntil(async () => busy.at(-1) === false)
  })

  it('flushes a valid correction when navigation unmounts the exercise immediately', async () => {
    await render()
    await selectCompleted()
    await change(reps(), '9')
    await act(async () => root!.unmount())
    root = undefined
    await waitUntil(async () => (await db.setEntries.get(completedSet.id))?.reps === 9)
  })

  it('resumes a correction stored before a reload instead of presenting stale saved work', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ id: completedSet.id, weight: '100', reps: '9', unit: 'lb' }),
    )
    await render()
    await waitUntil(async () => (await db.setEntries.get(completedSet.id))?.reps === 9)
    expect(await db.setEntries.count()).toBe(1)
  })

  it('keeps unfinished set values when selecting a completed set to inspect or correct', async () => {
    await render()
    await change(weight(), '50')
    await change(reps(), '6')
    await selectCompleted()
    await click(button('Add next set'))
    expect(weight().value).toBe('50')
    expect(reps().value).toBe('6')
    expect(await db.setEntries.count()).toBe(1)
  })

  it('saves edits entered while the first completion write is still pending', async () => {
    await db.setEntries.clear()
    await render([])
    await change(weight(), '100')
    await change(reps(), '8')
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const held = db.transaction('rw', db.setEntries, () => Dexie.waitFor(gate))
    try {
      await click(button('Complete set'))
      await change(reps(), '9')
    } finally {
      release!()
      await held
    }
    await waitUntil(async () => (await db.setEntries.toArray())[0]?.reps === 9)
    expect(await db.setEntries.count()).toBe(1)
    expect(reps().value).toBe('9')
  })

  it('restores an unfinished draft after reloading while inspecting a completed set', async () => {
    await render()
    await change(weight(), '50')
    await change(reps(), '6')
    await selectCompleted()
    await act(async () => root!.unmount())
    root = undefined
    await render()
    expect(weight().value).toBe('50')
    expect(reps().value).toBe('6')
    await click(button('Complete set'))
    await waitUntil(async () => (await db.setEntries.count()) === 2)
    await click(button('Add next set'))
    expect(host.querySelector('.entry-caption')?.textContent).toContain('not completed')
  })

  it('keeps invalid correction input blocked until the user cancels or supplies a valid value', async () => {
    await render()
    await selectCompleted()
    await change(reps(), '')
    await act(async () =>
      reps().dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
    )
    expect(busy.at(-1)).toBe(true)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    await click(button('Cancel correction'))
    expect(reps().value).toBe('8')
    expect(busy.at(-1)).toBe(false)
  })

  it('cancels a focused valid correction before blur can save it', async () => {
    await render()
    await selectCompleted()
    await act(async () => reps().focus())
    await change(reps(), '9')
    await act(async () => {
      button('Cancel correction').focus()
      button('Cancel correction').click()
    })
    expect(reps().value).toBe('8')
    expect((await db.setEntries.get(completedSet.id))?.reps).toBe(8)
    expect(busy.at(-1)).toBe(false)
  })

  it('keeps cancellation pending when its stored correction cannot be cleared', async () => {
    await render()
    await selectCompleted()
    await change(reps(), '9')
    const removeItem = Storage.prototype.removeItem
    const failure = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (key === storageKey)
          throw new DOMException('Storage access denied', 'SecurityError')
        removeItem.call(this, key)
      })
    try {
      await click(button('Cancel correction'))
      expect(reps().value).toBe('9')
      expect(busy.at(-1)).toBe(true)
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'could not be cleared',
      )
      expect(host.textContent).not.toContain('Saved on this device')
      expect(JSON.parse(localStorage.getItem(storageKey)!).reps).toBe('9')
      expect((await db.setEntries.get(completedSet.id))?.reps).toBe(8)
    } finally {
      failure.mockRestore()
    }
    await click(button('Cancel correction'))
    expect(reps().value).toBe('8')
    expect(busy.at(-1)).toBe(false)
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it('recovers an unfinished stored set and completes it without losing its identity', async () => {
    const unfinished = { ...completedSet, completedAt: undefined, reps: 6 }
    await db.setEntries.put(unfinished)
    await render([unfinished])
    expect(weight().value).toBe('100')
    expect(reps().value).toBe('6')
    await click(button('Complete set'))
    await waitUntil(async () =>
      Boolean((await db.setEntries.get(completedSet.id))?.completedAt),
    )
    expect(await db.setEntries.count()).toBe(1)
  })

  it('copies previous values as a draft and guards repeated completion taps', async () => {
    await db.setEntries.clear()
    await render([], true)
    await click(button('Use last'))
    expect(weight().value).toBe('100')
    expect(reps().value).toBe('8')
    expect(await db.setEntries.count()).toBe(0)
    await act(async () => {
      button('Complete set').click()
      button('Complete set').click()
    })
    await waitUntil(async () => (await db.setEntries.count()) === 1)
    expect(await db.setEntries.count()).toBe(1)
  })

  it('preserves exercise notes using the existing local storage key', async () => {
    localStorage.setItem('workout-tracker.notes.session.exercise', 'Keep the same grip')
    await render()
    await click(button('Options'))
    const notes = host.querySelector<HTMLTextAreaElement>('textarea')!
    expect(notes?.value).toBe('Keep the same grip')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        notes,
        'Use a pause',
      )
      notes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(localStorage.getItem('workout-tracker.notes.session.exercise')).toBe(
      'Use a pause',
    )
  })

  it('retains failed correction values and retries the same set without duplicating it', async () => {
    await render()
    await selectCompleted()
    await db.setEntries.delete(completedSet.id)
    await change(reps(), '9')
    await act(async () =>
      reps().dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
    )
    await waitUntil(async () => host.querySelector('[role="alert"]') !== null)
    expect(reps().value).toBe('9')
    expect(host.textContent).not.toContain('Saved on this device')
    expect(busy.at(-1)).toBe(true)
    await db.setEntries.put(completedSet)
    await click(button('Retry correction'))
    await waitUntil(async () => (await db.setEntries.get(completedSet.id))?.reps === 9)
    expect(await db.setEntries.count()).toBe(1)
  })

  it('keeps finishing blocked until all edits made during a correction write are stored', async () => {
    await render()
    await selectCompleted()
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const held = db.transaction('rw', db.setEntries, () => Dexie.waitFor(gate))
    try {
      await change(reps(), '9')
      await act(async () =>
        reps().dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
      )
      await change(reps(), '10')
      expect(busy.at(-1)).toBe(true)
    } finally {
      release!()
      await held
    }
    await waitUntil(async () => busy.at(-1) === false)
    expect((await db.setEntries.get(completedSet.id))?.reps).toBe(10)
    expect(busy.filter((value) => !value)).toHaveLength(1)
  })
})

async function click(button: HTMLElement): Promise<void> {
  await act(async () => button.click())
}
async function change(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function waitUntil(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    let complete = false
    await act(async () => {
      complete = await condition()
      if (!complete) await new Promise((resolve) => setTimeout(resolve, 10))
    })
    if (complete) return
  }
  throw new Error('Workout save did not reach the expected state.')
}
