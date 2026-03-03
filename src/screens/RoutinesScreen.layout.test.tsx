// ABOUTME: Verifies runtime routines-screen behavior for today/edit flows, history sheet UX, and rename isolation.
// ABOUTME: Guards mobile layout stability regressions with focused assertions tied to reported bugs.
/// <reference types="node" />
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, listExercises } from '../lib/db'
import { RoutinesScreen } from './RoutinesScreen'

interface RenderHarness {
  host: HTMLDivElement
  nav: HTMLElement | null
  cleanup: () => Promise<void>
}

describe('RoutinesScreen behavior', () => {
  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    document.body.innerHTML = ''
    await clearDatabase()
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    localStorage.clear()
    await clearDatabase()
  })

  it('renders today and edit as mutually exclusive screen states', async () => {
    const harness = await renderScreen()

    expect(harness.host.querySelector('.today-mode')).not.toBeNull()
    expect(harness.host.querySelector('.edit-mode')).toBeNull()

    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not appear after tapping Edit.',
    )

    expect(harness.host.querySelector('.today-mode')).toBeNull()
    expect(harness.host.querySelector('.day-picker')).not.toBeNull()

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.today-mode')),
      'Today mode did not reappear after tapping Today.',
    )

    expect(harness.host.querySelector('.edit-mode')).toBeNull()
    expect(harness.host.querySelector('.day-picker')).toBeNull()

    await harness.cleanup()
  })

  it('does not insert a global success banner when saving a quick-entry set', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.today-card') as HTMLElement | null

    expect(firstCard).not.toBeNull()

    const weightInput = firstCard?.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement | null
    const repsInput = firstCard?.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement | null
    const saveButton = firstCard?.querySelector(
      '.today-card__complete-button',
    ) as HTMLButtonElement | null

    expect(weightInput).not.toBeNull()
    expect(repsInput).not.toBeNull()
    expect(saveButton).not.toBeNull()

    await setInputValue(weightInput!, '95')
    await setInputValue(repsInput!, '8')
    await click(saveButton!)

    await waitFor(
      () => (harness.host.querySelector('.today-card__stats-value')?.textContent ?? '').includes('95 x 8'),
      'Saved set was not reflected in last-set stats.',
    )

    expect(harness.host.querySelector('.success-banner')).toBeNull()
    await harness.cleanup()
  })

  it('resets screen-area scroll when switching modes', async () => {
    const harness = await renderScreen()
    const scrollSpy = vi.fn()
    harness.host.scrollTo = scrollSpy as unknown as typeof harness.host.scrollTo

    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(() => scrollSpy.mock.calls.length > 0, 'Scroll reset was not triggered for edit mode.')

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    scrollSpy.mockClear()

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(() => scrollSpy.mock.calls.length > 0, 'Scroll reset was not triggered for today mode.')

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    await harness.cleanup()
  })

  it('opens and closes history sheet while locking bottom nav interaction', async () => {
    const harness = await renderScreen({ withBottomNav: true })
    const timerButton = getButtonByAriaLabelPrefix(harness.host, 'Open history for')
    await click(timerButton)

    await waitFor(
      () => Boolean(document.body.querySelector('.history-modal')),
      'History sheet did not open from the timer button.',
    )

    const nav = harness.nav
    expect(nav).not.toBeNull()
    expect(nav?.style.visibility).toBe('hidden')
    expect(nav?.style.pointerEvents).toBe('none')

    await delay(220)
    const backdrop = document.body.querySelector('.modal-backdrop') as HTMLDivElement | null
    expect(backdrop).not.toBeNull()
    await click(backdrop!)

    await waitFor(
      () => !document.body.querySelector('.history-modal'),
      'History sheet did not close from backdrop tap.',
    )

    expect(nav?.style.visibility).toBe('')
    expect(nav?.style.pointerEvents).toBe('')
    await harness.cleanup()
  })

  it('does not rename exercises in other routines when one edit-row name changes', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')
    await click(getButtonByText(harness.host, '4 day'))

    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Day 2') !== null,
      '4-day routine cards were not rendered.',
    )

    await click(getButtonByTextIncludes(harness.host, 'Day 2')!)

    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, 'Leg Press')),
      'Day 2 did not render a Leg Press edit row.',
    )

    const legPressRow = findEditRowByTitle(harness.host, 'Leg Press')
    expect(legPressRow).not.toBeNull()

    const nameInput = legPressRow?.querySelector('label input') as HTMLInputElement | null
    expect(nameInput).not.toBeNull()
    await setInputValue(nameInput!, 'Hamstring Curl')

    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Save did not return to today mode.')

    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not reopen.')

    await click(getButtonByTextIncludes(harness.host, 'Day 4')!)
    await waitFor(
      () => harness.host.querySelectorAll('.edit-exercise-row h3').length > 0,
      'Day 4 exercises did not load.',
    )

    const day4ExerciseTitles = Array.from(harness.host.querySelectorAll('.edit-exercise-row h3')).map(
      (titleNode) => titleNode.textContent?.trim() ?? '',
    )

    expect(day4ExerciseTitles).toContain('Leg Press')
    await harness.cleanup()
  })

  it('creates an isolated exercise record when renaming to an existing exercise name', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')
    await click(getButtonByText(harness.host, '4 day'))
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Day 2') !== null,
      '4-day routine cards were not rendered.',
    )

    await click(getButtonByTextIncludes(harness.host, 'Day 2')!)
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, 'Leg Press')),
      'Day 2 did not render a Leg Press edit row.',
    )

    const legPressRow = findEditRowByTitle(harness.host, 'Leg Press')
    expect(legPressRow).not.toBeNull()

    const nameInput = legPressRow?.querySelector('label input') as HTMLInputElement | null
    expect(nameInput).not.toBeNull()
    await setInputValue(nameInput!, 'Lying Hamstring Curl')

    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Save did not return to today mode.')
    await act(async () => {
      await delay(25)
    })

    const exercises = await listExercises()
    const duplicates = exercises.filter((exercise) => exercise.name === 'Lying Hamstring Curl')
    expect(duplicates).toHaveLength(2)

    await harness.cleanup()
  })

  it('keeps today active-day header non-sticky to prevent clipping artifacts', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const block = getRuleBlock(css, '.today-active-day-header')

    expect(block).not.toContain('position: sticky')
    expect(block).not.toContain('top: 0')
  })
})

async function renderScreen(options?: { withBottomNav?: boolean }): Promise<RenderHarness> {
  const shell = document.createElement('div')
  shell.className = 'app-shell'

  const host = document.createElement('div')
  host.className = 'screen-area'
  host.scrollTo = (() => undefined) as typeof host.scrollTo
  shell.append(host)

  let nav: HTMLElement | null = null
  if (options?.withBottomNav) {
    nav = document.createElement('nav')
    nav.className = 'bottom-nav'
    shell.append(nav)
  }

  document.body.append(shell)

  const root = createRoot(host)
  await act(async () => {
    root.render(<RoutinesScreen />)
  })

  await waitFor(
    () => Boolean(host.querySelector('.today-card') || host.querySelector('.button.button--primary')),
    'Routines screen did not finish initial render.',
  )

  return {
    host,
    nav,
    cleanup: async () => {
      await cleanupRender(root, shell)
    },
  }
}

async function cleanupRender(root: Root, shell: HTMLElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  shell.remove()
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)

  await act(async () => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

function getButtonByText(container: ParentNode, label: string): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )

  if (!target) {
    throw new Error(`Could not find button with text: ${label}`)
  }

  return target as HTMLButtonElement
}

function getButtonByTextIncludes(container: ParentNode, labelPart: string): HTMLButtonElement | null {
  return (
    (Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').toLowerCase().includes(labelPart.toLowerCase()),
    ) as HTMLButtonElement | undefined) ?? null
  )
}

function getButtonByAriaLabelPrefix(container: ParentNode, prefix: string): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll('button')).find((button) =>
    (button.getAttribute('aria-label') ?? '').startsWith(prefix),
  )

  if (!target) {
    throw new Error(`Could not find button with aria-label prefix: ${prefix}`)
  }

  return target as HTMLButtonElement
}

function findEditRowByTitle(container: ParentNode, title: string): HTMLElement | null {
  return (
    (Array.from(container.querySelectorAll('.edit-exercise-row')).find(
      (row) => row.querySelector('h3')?.textContent?.trim() === title,
    ) as HTMLElement | undefined) ?? null
  )
}

async function waitFor(
  condition: () => boolean,
  failureMessage: string,
  timeoutMs = 4500,
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return
    }
    await act(async () => {
      await delay(25)
    })
  }

  throw new Error(failureMessage)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function clearDatabase(): Promise<void> {
  await db.transaction('rw', db.exercises, db.routines, db.sessions, db.setEntries, async () => {
    await db.setEntries.clear()
    await db.sessions.clear()
    await db.routines.clear()
    await db.exercises.clear()
  })
}

function getRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace('.', '\\.')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'))
  return match?.[1] ?? ''
}
