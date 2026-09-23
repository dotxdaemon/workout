// ABOUTME: Exercises history display and durable correction of recorded sets.
// ABOUTME: Uses IndexedDB records to verify ordering, units, autosave, and failed-write recovery.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import type { SessionRecord, SetEntry } from '../types'
import { ExerciseHistory } from './ExerciseHistory'

const session: SessionRecord = {
  id: 'history-session',
  startedAt: '2026-09-12T12:00:00.000Z',
  endedAt: '2026-09-12T13:00:00.000Z',
}
const recordedSet: SetEntry = {
  id: 'working-set',
  sessionId: session.id,
  exerciseId: 'exercise',
  index: 2,
  weight: 100,
  reps: 8,
  unit: 'lb',
  isWarmup: false,
  completedAt: '2026-09-12T12:30:00.000Z',
}

describe('ExerciseHistory', () => {
  let root: Root | undefined
  let host: HTMLDivElement

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    host = document.createElement('div')
    localStorage.clear()
    document.body.append(host)
    await db.setEntries.clear()
    await db.sessions.clear()
    await db.sessions.put(session)
    await db.setEntries.put(recordedSet)
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host.remove()
    await db.setEntries.clear()
    await db.sessions.clear()
  })

  async function render(sets: SetEntry[] = [recordedSet]): Promise<void> {
    root = createRoot(host)
    await act(async () => {
      root!.render(<ExerciseHistory rows={[{ session, sets }]} unit="lb" />)
    })
  }

  it('shows the session date, recorded units, original set order, and warm-up distinction', async () => {
    const warmup = {
      ...recordedSet,
      id: 'warmup',
      index: 0,
      weight: 20,
      unit: 'kg' as const,
      isWarmup: true,
    }
    const earlierWork = { ...recordedSet, id: 'earlier-work', index: 1, weight: 95 }
    await render([recordedSet, warmup, earlierWork])

    expect(host.querySelector('time')?.getAttribute('datetime')).toBe(session.startedAt)
    const rows = Array.from(host.querySelectorAll('[data-history-set]'))
    expect(rows.map((row) => row.getAttribute('data-history-set'))).toEqual([
      'warmup',
      'earlier-work',
      'working-set',
    ])
    expect(rows[0].textContent).toContain('Warm-up')
    expect(rows[0].textContent).toContain('20 kg')
    expect(rows[2].textContent).toContain('100 lb')
    expect(host.textContent).toContain('Estimated 1RM')
  })

  it('autosaves a correction on blur without changing identity, date, order, or count', async () => {
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    const input = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!
    await change(input, '102,25')
    expect(host.textContent).not.toContain('Saved on device')
    await blur(input)
    await waitUntil(
      async () => (await db.setEntries.get(recordedSet.id))?.weight === 102.25,
    )
    await waitUntil(async () => host.textContent?.includes('Saved on device') ?? false)

    expect(await db.setEntries.count()).toBe(1)
    expect(await db.setEntries.get(recordedSet.id)).toEqual({
      ...recordedSet,
      weight: 102.25,
    })
  })

  it('preserves stored precision when opening and closing a correction', async () => {
    const precise = { ...recordedSet, weight: 100.123456 }
    await db.setEntries.put(precise)
    await render([precise])
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    expect(
      host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value,
    ).toBe('100.123456')
    await act(async () => {
      root!.unmount()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    root = undefined
    expect((await db.setEntries.get(recordedSet.id))?.weight).toBe(100.123456)
  })

  it('allows temporary empty input and autosaves the latest valid zero-load value', async () => {
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    const input = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!
    await change(input, '')
    await blur(input)
    expect((await db.setEntries.get(recordedSet.id))?.weight).toBe(100)
    expect(input.value).toBe('')
    await change(input, '110')
    await change(input, '0')
    await waitUntil(async () => (await db.setEntries.get(recordedSet.id))?.weight === 0)
    expect((await db.setEntries.get(recordedSet.id))?.weight).toBe(0)
    expect(await db.setEntries.count()).toBe(1)
  })

  it('keeps the entered correction after a failed write and supports retry', async () => {
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    const input = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!
    await change(input, '10')
    await db.setEntries.delete(recordedSet.id)
    await blur(input)
    await waitUntil(async () => host.querySelector('[role="alert"]') !== null)
    expect(input.value).toBe('10')
    expect(host.textContent).not.toContain('Saved on device')
    await db.setEntries.put(recordedSet)
    const retry = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Retry',
    )!
    await click(retry)
    await waitUntil(async () => (await db.setEntries.get(recordedSet.id))?.reps === 10)
    expect(await db.setEntries.count()).toBe(1)
  })

  it('retains invalid and failed corrections when history is closed and reopened', async () => {
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    await change(host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '')
    await act(async () => root!.unmount())
    root = undefined
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    const weight = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!
    expect(weight.value).toBe('')
    expect((await db.setEntries.get(recordedSet.id))?.weight).toBe(100)

    await change(weight, '105.25')
    await db.setEntries.delete(recordedSet.id)
    await blur(weight)
    await waitUntil(async () => host.querySelector('[role="alert"]') !== null)
    await act(async () => root!.unmount())
    root = undefined
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    expect(
      host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value,
    ).toBe('105.25')
    const cancel = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel correction',
    )!
    await click(cancel)
    expect(
      host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value,
    ).toBe('100')
    expect(
      localStorage.getItem(`workout-tracker.entry.history.${recordedSet.id}`),
    ).toBeNull()
  })

  it('cancels a focused valid correction without saving it as focus moves to Cancel', async () => {
    await render()
    await click(host.querySelector<HTMLButtonElement>('[aria-label^="Correct set"]')!)
    const weight = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!
    await act(async () => weight.focus())
    await change(weight, '105')
    const cancel = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel correction',
    )!
    await act(async () => {
      cancel.focus()
      cancel.click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(weight.value).toBe('100')
    expect((await db.setEntries.get(recordedSet.id))?.weight).toBe(100)
  })
})

async function click(button: HTMLButtonElement): Promise<void> {
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

async function blur(input: HTMLInputElement): Promise<void> {
  await act(async () =>
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
  )
}

async function waitUntil(condition: () => Promise<boolean>): Promise<void> {
  for (let pass = 0; pass < 120; pass += 1) {
    let complete = false
    await act(async () => {
      complete = await condition()
      if (!complete) await new Promise((resolve) => setTimeout(resolve, 10))
    })
    if (complete) return
  }
  throw new Error('History update did not finish.')
}
