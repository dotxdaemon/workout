// ABOUTME: Verifies runtime routines-screen behavior for today/edit flows, history sheet UX, and rename isolation.
// ABOUTME: Guards mobile layout stability regressions with focused assertions tied to reported bugs.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, ensureCoreRoutines, listExercises } from '../lib/db'
import { RoutinesScreen } from './RoutinesScreen'

interface RenderHarness {
  host: HTMLDivElement
  nav: HTMLElement | null
  cleanup: () => Promise<void>
}

describe('RoutinesScreen behavior', () => {
  const originalWindowScrollTo = window.scrollTo

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useRealTimers()
    localStorage.clear()
    document.body.innerHTML = ''
    window.scrollTo = (() => undefined) as typeof window.scrollTo
    const scrollingElement = getDocumentScrollElement()
    scrollingElement.scrollTop = 0
    scrollingElement.scrollTo = (() => undefined) as typeof scrollingElement.scrollTo
    await clearDatabase()
  })

  afterEach(async () => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    localStorage.clear()
    window.scrollTo = originalWindowScrollTo
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
      '.today-card__save-button',
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

  it('keeps screen-area scrolling responsive after saving a quick-entry set', async () => {
    const harness = await renderScreen()
    let setTimeoutSpy: ReturnType<typeof vi.spyOn> | null = null

    try {
      const firstCard = harness.host.querySelector('.today-card') as HTMLElement | null

      expect(firstCard).not.toBeNull()

      const weightInput = firstCard?.querySelector(
        'input[inputmode="decimal"]',
      ) as HTMLInputElement | null
      const repsInput = firstCard?.querySelector(
        'input[inputmode="numeric"]',
      ) as HTMLInputElement | null
      const saveButton = firstCard?.querySelector(
        '.today-card__save-button',
      ) as HTMLButtonElement | null

      expect(weightInput).not.toBeNull()
      expect(repsInput).not.toBeNull()
      expect(saveButton).not.toBeNull()

      const scrollTopBeforeSave = 212
      harness.host.scrollTop = scrollTopBeforeSave
      const scrollingElement = getDocumentScrollElement()
      const documentScrollSpy = vi.fn((options?: ScrollToOptions | number) => {
        if (typeof options === 'object' && typeof options?.top === 'number') {
          scrollingElement.scrollTop = options.top
        }
      })
      const screenAreaScrollSpy = vi.fn((options?: ScrollToOptions | number) => {
        if (typeof options === 'object' && typeof options?.top === 'number') {
          harness.host.scrollTop = options.top
        }
      })
      harness.host.scrollTo = screenAreaScrollSpy as unknown as typeof harness.host.scrollTo
      scrollingElement.scrollTo = documentScrollSpy as unknown as typeof scrollingElement.scrollTo
      await setInputValue(weightInput!, '105')
      await setInputValue(repsInput!, '7')
      harness.host.scrollTop = scrollTopBeforeSave + 18

      await click(saveButton!)

      await waitFor(
        () => (harness.host.querySelector('.today-card__stats-value')?.textContent ?? '').includes('105 x 7'),
        'Saved set was not reflected in last-set stats.',
      )

      let savedFeedbackCallback: (() => void) | null = null
      setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(
        ((handler: TimerHandler) => {
          if (typeof handler === 'function') {
            savedFeedbackCallback = handler as () => void
          }
          return 1 as unknown as number
        }) as typeof window.setTimeout,
      )

      documentScrollSpy.mockClear()
      screenAreaScrollSpy.mockClear()
      harness.host.scrollTop = 96

      await act(async () => {
        savedFeedbackCallback?.()
        await Promise.resolve()
      })

      expect(documentScrollSpy).not.toHaveBeenCalled()
      expect(screenAreaScrollSpy).not.toHaveBeenCalled()
      expect(harness.host.scrollTop).toBe(96)
    } finally {
      setTimeoutSpy?.mockRestore()
      await harness.cleanup()
    }
  })

  it('does not blur the active quick-entry input when saving a set', async () => {
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
      '.today-card__save-button',
    ) as HTMLButtonElement | null

    expect(weightInput).not.toBeNull()
    expect(repsInput).not.toBeNull()
    expect(saveButton).not.toBeNull()

    await act(async () => {
      repsInput?.focus()
    })

    expect(document.activeElement).toBe(repsInput)

    let blurCount = 0
    repsInput?.addEventListener('blur', () => {
      blurCount += 1
    })

    await setInputValue(weightInput!, '95')
    await setInputValue(repsInput!, '8')
    await click(saveButton!)

    await waitFor(
      () => (harness.host.querySelector('.today-card__stats-value')?.textContent ?? '').includes('95 x 8'),
      'Saved set was not reflected in last-set stats.',
    )

    expect(blurCount).toBe(0)
    await harness.cleanup()
  })

  it('keeps advanced exercise settings hidden until one row is opened', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const benchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    expect(benchRow).not.toBeNull()

    expect(benchRow?.textContent).not.toContain('Rep min')
    expect(benchRow?.textContent).not.toContain('Rep max')
    expect(benchRow?.textContent).not.toContain('Work sets')
    expect(benchRow?.textContent).not.toContain('Increment')
    expect(benchRow?.querySelector('select')).toBeNull()

    await click(getButtonByTextWithin(benchRow!, 'Advanced'))

    await waitFor(
      () => (benchRow?.textContent ?? '').includes('Rep min') && Boolean(benchRow?.querySelector('select')),
      'Advanced exercise settings did not appear after opening a row.',
    )

    expect(benchRow?.textContent).toContain('Rep min')
    expect(benchRow?.textContent).toContain('Rep max')
    expect(benchRow?.textContent).toContain('Work sets')
    expect(benchRow?.textContent).toContain('Increment')
    expect(benchRow?.querySelector('select')).not.toBeNull()

    const overheadRow = findEditRowByTitle(harness.host, 'Overhead Press')
    expect(overheadRow?.textContent).not.toContain('Rep min')

    await harness.cleanup()
  })

  it('closes advanced exercise settings when leaving edit mode and when switching routines', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const benchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    expect(benchRow).not.toBeNull()

    await click(getButtonByTextWithin(benchRow!, 'Advanced'))
    await waitFor(
      () => (benchRow?.textContent ?? '').includes('Rep min'),
      'Advanced exercise settings did not appear before mode switch.',
    )

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Today mode did not open.')

    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not reopen.')

    const reopenedBenchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    expect(reopenedBenchRow?.textContent).not.toContain('Rep min')

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
    expect(legPressRow?.textContent).not.toContain('Rep min')

    await harness.cleanup()
  })

  it('creates a new exercise record on the first add attempt when the text does not exactly match an existing exercise', async () => {
    const harness = await renderScreen()
    const revealedRows: HTMLElement[] = []
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      revealedRows.push(this)
    })
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    await click(getButtonByText(harness.host, 'Edit'))

    try {
      await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')
      const exercisesBefore = await listExercises()

      const uniqueName = `Codex Exercise ${Date.now()}`
      const addExerciseInput = harness.host.querySelector(
        'input[placeholder="Add exercise"]',
      ) as HTMLInputElement | null

      expect(addExerciseInput).not.toBeNull()

      await setInputValue(addExerciseInput!, uniqueName)
      await click(getButtonByText(harness.host, 'Add'))

      await waitFor(
        () =>
          Array.from(harness.host.querySelectorAll('.edit-exercise-row h3')).some(
            (title) => title.textContent?.trim() === uniqueName,
          ),
        'Added exercise did not appear in the draft list after the first add.',
      )

      await waitFor(() => scrollIntoView.mock.calls.length > 0, 'Added exercise row was not revealed.')

      const addedRow = findEditRowByTitle(harness.host, uniqueName)
      expect(revealedRows).toContain(addedRow)
      const exercisesAfter = await listExercises()
      expect(exercisesAfter).toHaveLength(exercisesBefore.length + 1)
      expect(exercisesAfter.some((exercise) => exercise.name === uniqueName)).toBe(true)
    } finally {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView
      await harness.cleanup()
    }
  })

  it('reuses an existing exercise record on an exact-name add', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const exercisesBefore = await listExercises()
    const benchPress = exercisesBefore.find((exercise) => exercise.name === 'Bench Press')
    expect(benchPress).not.toBeUndefined()

    const rowCountBeforeAdd = harness.host.querySelectorAll('.edit-exercise-row').length
    const addExerciseInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement | null

    expect(addExerciseInput).not.toBeNull()

    await setInputValue(addExerciseInput!, 'bench press')
    await click(getButtonByText(harness.host, 'Add'))

    await waitFor(
      () => harness.host.querySelectorAll('.edit-exercise-row').length === rowCountBeforeAdd + 1,
      'Exact-name add did not reuse the existing exercise row.',
    )

    const exercisesAfter = await listExercises()
    expect(exercisesAfter).toHaveLength(exercisesBefore.length)
    expect(findEditRowByTitle(harness.host, 'Bench Press')).not.toBeNull()

    await harness.cleanup()
  })

  it('does not blur the active edit input when saving a routine', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const routineNameInput = harness.host.querySelector(
      '.panel.panel--compact label input',
    ) as HTMLInputElement | null

    expect(routineNameInput).not.toBeNull()

    await act(async () => {
      routineNameInput?.focus()
    })

    expect(document.activeElement).toBe(routineNameInput)

    let blurCount = 0
    routineNameInput?.addEventListener('blur', () => {
      blurCount += 1
    })

    await act(async () => {
      await click(getButtonByText(harness.host, 'Save routine'))
    })
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Save did not return to today mode.')

    expect(blurCount).toBe(0)
    await harness.cleanup()
  })

  it('resets the screen-area scroll when saving a routine and changing modes', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const routineNameInput = harness.host.querySelector(
      '.panel.panel--compact label input',
    ) as HTMLInputElement | null

    expect(routineNameInput).not.toBeNull()

    const scrollTopBeforeSave = 260
    harness.host.scrollTop = scrollTopBeforeSave
    const scrollingElement = getDocumentScrollElement()
    const documentScrollSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === 'object' && typeof options?.top === 'number') {
        scrollingElement.scrollTop = options.top
      }
    })
    const screenAreaScrollSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === 'object' && typeof options?.top === 'number') {
        harness.host.scrollTop = options.top
      }
    })
    harness.host.scrollTo = screenAreaScrollSpy as unknown as typeof harness.host.scrollTo
    scrollingElement.scrollTo = documentScrollSpy as unknown as typeof scrollingElement.scrollTo

    await setInputValue(routineNameInput!, 'Push')
    harness.host.scrollTop = scrollTopBeforeSave + 24
    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Save did not return to today mode.')
    await waitForNextFrame()

    expect(screenAreaScrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    expect(documentScrollSpy).not.toHaveBeenCalled()
    expect(harness.host.scrollTop).toBe(0)
    await harness.cleanup()
  })

  it('does not hijack a page press into a blur while editing', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')

    const routineNameInput = harness.host.querySelector(
      '.panel.panel--compact label input',
    ) as HTMLInputElement | null

    expect(routineNameInput).not.toBeNull()

    await act(async () => {
      routineNameInput?.focus()
    })

    expect(document.activeElement).toBe(routineNameInput)

    await act(async () => {
      ;(harness.host.querySelector('.page') as HTMLElement).dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(routineNameInput)
    await harness.cleanup()
  })

  it('uses a text-labeled save action and moves history out of the quick-entry row', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.today-card') as HTMLElement | null

    expect(firstCard).not.toBeNull()

    const saveButton = firstCard?.querySelector('.today-card__save-button') as HTMLButtonElement | null
    const historyButton = firstCard?.querySelector('.today-card__history-button') as HTMLButtonElement | null
    const quickInputRow = firstCard?.querySelector('.today-input-row') as HTMLElement | null

    expect(saveButton?.textContent?.trim()).toBe('Save')
    expect(historyButton?.textContent?.trim()).toBe('History')
    expect(quickInputRow?.querySelector('.today-card__history-button')).toBeNull()

    await harness.cleanup()
  })

  it('shows inline saved feedback on the save action after logging a set', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.today-card') as HTMLElement | null

    expect(firstCard).not.toBeNull()

    const weightInput = firstCard?.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement | null
    const repsInput = firstCard?.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement | null
    const saveButton = firstCard?.querySelector('.today-card__save-button') as HTMLButtonElement | null

    expect(weightInput).not.toBeNull()
    expect(repsInput).not.toBeNull()
    expect(saveButton).not.toBeNull()

    await setInputValue(weightInput!, '100')
    await setInputValue(repsInput!, '8')
    await click(saveButton!)

    await waitFor(
      () => saveButton?.textContent?.trim() === 'Saved',
      'Save action did not surface saved feedback.',
    )

    await harness.cleanup()
  })

  it('resets the screen-area scroll when switching modes', async () => {
    const harness = await renderScreen()
    const scrollSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === 'object' && typeof options?.top === 'number') {
        harness.host.scrollTop = options.top
      }
    })
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
    await click(timerButton, { timeStamp: 0 })

    await waitFor(
      () => Boolean(document.body.querySelector('.history-modal')),
      'History sheet did not open from the timer button.',
    )

    const nav = harness.nav
    expect(nav).not.toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(harness.host.style.overflow).toBe('')
    expect(nav?.style.visibility).toBe('hidden')
    expect(nav?.style.pointerEvents).toBe('none')

    const backdrop = document.body.querySelector('.modal-backdrop') as HTMLDivElement | null
    expect(backdrop).not.toBeNull()
    await click(backdrop!, { timeStamp: 220 })

    await waitFor(
      () => !document.body.querySelector('.history-modal'),
      'History sheet did not close from backdrop tap.',
    )

    expect(document.body.style.overflow).toBe('')
    expect(harness.host.style.overflow).toBe('')
    expect(nav?.style.visibility).toBe('')
    expect(nav?.style.pointerEvents).toBe('')
    await harness.cleanup()
  })

  it('explains the empty history state with next-step copy', async () => {
    const harness = await renderScreen({ withBottomNav: true })
    const timerButton = getButtonByAriaLabelPrefix(harness.host, 'Open history for')
    await click(timerButton)

    await waitFor(
      () => Boolean(document.body.querySelector('.history-modal')),
      'History sheet did not open from the timer button.',
    )

    await waitFor(
      () =>
        (document.body.textContent ?? '').includes('No history yet.') &&
        (document.body.textContent ?? '').includes('Log a set and it will show up here.'),
      'Empty history copy did not render after the history sheet loaded.',
    )

    expect(document.body.textContent).toContain('No history yet.')
    expect(document.body.textContent).toContain('Log a set and it will show up here.')

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

    await click(getButtonByTextWithin(legPressRow!, 'Advanced'))
    await waitFor(
      () => Boolean(legPressRow?.querySelector('label input')),
      'Advanced edit controls did not open for Leg Press.',
    )

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

    await click(getButtonByTextWithin(legPressRow!, 'Advanced'))
    await waitFor(
      () => Boolean(legPressRow?.querySelector('label input')),
      'Advanced edit controls did not open for Leg Press.',
    )

    const nameInput = legPressRow?.querySelector('label input') as HTMLInputElement | null
    expect(nameInput).not.toBeNull()
    await setInputValue(nameInput!, 'Lying Hamstring Curl')

    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(() => Boolean(harness.host.querySelector('.today-mode')), 'Save did not return to today mode.')
    await waitForAsync(async () => {
      const exercises = await listExercises()
      const duplicates = exercises.filter((exercise) => exercise.name === 'Lying Hamstring Curl')
      return duplicates.length === 2
    }, 'Renaming to an existing exercise name did not create an isolated exercise record.')

    await harness.cleanup()
  })

  it('reuses an existing exercise from an inline suggestion', async () => {
    await ensureCoreRoutines('lb')
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))

    await waitFor(() => Boolean(harness.host.querySelector('.edit-mode')), 'Edit mode did not open.')
    const exercisesBefore = await listExercises()

    const rowCountBeforeAdd = harness.host.querySelectorAll('.edit-exercise-row').length
    const addExerciseInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement | null

    expect(addExerciseInput).not.toBeNull()

    await setInputValue(addExerciseInput!, 'bench')
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Bench Press') !== null,
      'Inline exercise suggestion did not appear for a partial match.',
    )

    await click(getButtonByTextIncludes(harness.host, 'Bench Press')!)

    await waitFor(
      () => harness.host.querySelectorAll('.edit-exercise-row').length === rowCountBeforeAdd + 1,
      'Selecting an inline suggestion did not add the existing exercise row.',
    )

    const exercisesAfter = await listExercises()
    expect(exercisesAfter).toHaveLength(exercisesBefore.length)
    expect(findEditRowByTitle(harness.host, 'Bench Press')).not.toBeNull()

    await harness.cleanup()
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

async function click(
  element: HTMLElement,
  options?: { timeStamp?: number },
): Promise<void> {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  if (options?.timeStamp != null) {
    Object.defineProperty(event, 'timeStamp', {
      configurable: true,
      value: options.timeStamp,
    })
  }

  await act(async () => {
    element.dispatchEvent(event)
    await Promise.resolve()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
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

function getDocumentScrollElement(): HTMLElement {
  return (document.scrollingElement ?? document.documentElement) as HTMLElement
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

function getButtonByTextWithin(container: ParentNode, label: string): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )

  if (!target) {
    throw new Error(`Could not find nested button with text: ${label}`)
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
  maxPasses = 500,
): Promise<void> {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (condition()) {
      return
    }

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  throw new Error(failureMessage)
}

async function waitForAsync(
  condition: () => Promise<boolean>,
  failureMessage: string,
  maxPasses = 500,
): Promise<void> {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (await condition()) {
      return
    }

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  throw new Error(failureMessage)
}

async function waitForNextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
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
