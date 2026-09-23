// ABOUTME: Verifies runtime training-screen behavior for today/edit flows, set logging, and history.
// ABOUTME: Guards rename isolation, scroll resets, history sheet lifecycle, and progression surfacing.
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

const mountedScreens = new Map<Root, HTMLElement>()

describe('RoutinesScreen behavior', () => {
  const originalWindowScrollTo = window.scrollTo

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
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
    for (const [root, shell] of mountedScreens) await cleanupRender(root, shell)
    document.body.innerHTML = ''
    localStorage.clear()
    window.scrollTo = originalWindowScrollTo
    await clearDatabase()
  })

  it('logs zero load, prevents repeated completion, and autosaves correction without a duplicate', async () => {
    const harness = await renderScreen()
    const card = harness.host.querySelector('.exercise-card') as HTMLElement
    await setInputValue(card.querySelector('input[inputmode="decimal"]')!, '0')
    await setInputValue(card.querySelector('input[inputmode="numeric"]')!, '8')
    const complete = card.querySelector<HTMLButtonElement>('.quick-entry__save')!
    await act(async () => {
      complete.click()
      complete.click()
    })
    await waitForAsync(
      async () => (await db.setEntries.count()) === 1,
      'Zero-load set was not completed.',
    )
    const original = (await readStored(() => db.setEntries.toArray()))[0]
    expect(original.weight).toBe(0)
    expect(card.textContent).toContain('Saved on this device')
    await setInputValue(card.querySelector('input[inputmode="numeric"]')!, '9')
    await waitForAsync(
      async () => (await db.setEntries.get(original.id))?.reps === 9,
      'Correction was not autosaved.',
    )
    expect(await readStored(() => db.setEntries.count())).toBe(1)
    await harness.cleanup()
  })

  it('keeps only the selected exercise expanded with visible Weight and Reps labels', async () => {
    const harness = await renderScreen()
    expect(harness.host.querySelectorAll('.quick-entry').length).toBe(1)
    const card = harness.host.querySelector('.exercise-card') as HTMLElement
    expect(card.textContent).toContain('Weight (lb)')
    expect(card.textContent).toContain('Reps')
    const second = harness.host.querySelectorAll('.exercise-card')[1] as HTMLElement
    await click(second.querySelector('.exercise-card__title-btn')!)
    expect(second.querySelector('.quick-entry')).not.toBeNull()
    expect(card.querySelector('.quick-entry')).toBeNull()
    await harness.cleanup()
  })

  it('finishes explicitly and shows the recorded workout as previous performance after reload', async () => {
    const harness = await renderScreen()
    const card = harness.host.querySelector('.exercise-card') as HTMLElement
    await logSet(card, '135', '8')
    await waitForAsync(async () => (await db.setEntries.count()) === 1, 'Set missing.')
    const entry = (await readStored(() => db.setEntries.toArray()))[0]
    await click(getButtonByText(harness.host, 'Finish workout'))
    await waitForAsync(
      async () => Boolean((await db.sessions.get(entry.sessionId))?.endedAt),
      'Workout did not finish.',
    )
    await harness.cleanup()
    const resumed = await renderScreen()
    await waitFor(
      () =>
        (resumed.host.querySelector('.last-line')?.textContent ?? '').includes('135 lb'),
      'Previous workout missing after reload.',
    )
    expect(await readStored(() => db.setEntries.count())).toBe(1)
    await resumed.cleanup()
  })

  it('renders today and edit as mutually exclusive screen states', async () => {
    const harness = await renderScreen()

    expect(harness.host.querySelector('.train-today')).not.toBeNull()
    expect(harness.host.querySelector('.edit-mode')).toBeNull()

    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not appear after tapping Edit.',
    )

    expect(harness.host.querySelector('.train-today')).toBeNull()
    expect(harness.host.querySelector('.day-picker')).not.toBeNull()

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Today mode did not reappear after tapping Today.',
    )

    expect(harness.host.querySelector('.edit-mode')).toBeNull()
    expect(harness.host.querySelector('.day-picker')).toBeNull()

    await harness.cleanup()
  })

  it('organizes Today around a session masthead and a continuous exercise ledger', async () => {
    const harness = await renderScreen()

    expect(harness.host.querySelector('.training-console')).not.toBeNull()
    expect(harness.host.querySelector('.training-ledger')).not.toBeNull()
    expect(
      harness.host.querySelectorAll('.training-ledger .exercise-card').length,
    ).toBeGreaterThan(0)

    await harness.cleanup()
  })

  it('keeps Today navigation compact while preserving day selection and Edit split controls', async () => {
    const harness = await renderScreen()
    const header = harness.host.querySelector('.training-console')!
    expect(header.querySelector('.eyebrow')).toBeNull()
    expect(header.classList.contains('training-console--today')).toBe(true)
    expect(header.querySelector('[aria-label="Training mode"]')).not.toBeNull()
    expect(header.querySelector('[aria-label="Select training day"]')).not.toBeNull()

    await click(getButtonByAriaLabelPrefix(header, 'Day 2: Pull'))
    await waitFor(
      () => harness.host.querySelector('.training-ledger__title')?.textContent === 'Pull',
      'Day selection did not change the current workout.',
    )
    expect(findExerciseCardByTitle(harness.host, 'Barbell Row')).not.toBeNull()
    expect(
      getButtonByAriaLabelPrefix(header, 'Day 2: Pull').getAttribute('aria-selected'),
    ).toBe('true')

    await click(getButtonByText(header, 'Edit'))
    expect(header.classList.contains('training-console--today')).toBe(false)
    expect(header.querySelector('.eyebrow')?.textContent).toContain('3-DAY')
    expect(getButtonByText(harness.host, '3 day')).not.toBeNull()
    await click(getButtonByText(harness.host, '4 day'))
    await waitFor(
      () => header.querySelector('.eyebrow')?.textContent?.includes('4-DAY') ?? false,
      'Edit split selection did not update its heading.',
    )
    await click(getButtonByText(header, 'Today'))
    await waitFor(
      () => harness.host.querySelector('.training-ledger__title')?.textContent === 'Pull',
      'Returning to Today did not restore the active workout.',
    )
    expect(header.querySelector('.eyebrow')).toBeNull()
    await harness.cleanup()
  })

  it('keeps removed stats, counters, empty slots, and weight chips out of set entry', async () => {
    const harness = await renderScreen()

    expect(harness.host.querySelector('.training-ledger__stats')).toBeNull()
    expect(harness.host.querySelector('.set-track__count')).toBeNull()
    expect(harness.host.querySelector('.set-slot')).toBeNull()
    expect(harness.host.querySelector('[aria-label^="Adjust "]')).toBeNull()
    expect(harness.host.querySelector('.weight-chip')).toBeNull()

    await harness.cleanup()
  })

  it('keeps an incomplete decimal-weight draft when selecting another exercise and reloading', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement
    const weightInput = firstCard.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement
    const repsInput = firstCard.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement

    await setInputValue(weightInput, '100,25')
    await setInputValue(repsInput, '8')
    const second = harness.host.querySelectorAll('.exercise-card')[1]
    await click(second.querySelector('.exercise-card__title-btn')!)
    expect(await readStored(() => db.setEntries.count())).toBe(0)
    await harness.cleanup()
    const resumed = await renderScreen()
    expect(
      resumed.host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.value,
    ).toBe('100.25')
    expect(
      resumed.host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')?.value,
    ).toBe('8')
    expect(await readStored(() => db.setEntries.count())).toBe(0)
    await resumed.cleanup()
  })

  it('defaults the 3-day split to Push as the first training day (Day 1)', async () => {
    const harness = await renderScreen()

    await waitFor(
      () =>
        harness.host.querySelector('.training-ledger__title')?.textContent?.trim() ===
        'Push',
      'Push did not become the selected training day.',
    )

    const dayChips = Array.from(
      harness.host.querySelectorAll('.day-chips .day-chip'),
    ) as HTMLElement[]
    expect(dayChips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Day 1: Push',
      'Day 2: Pull',
      'Day 3: Legs',
    ])

    const activeChip = harness.host.querySelector('.day-chips .day-chip--active')
    expect(activeChip).toBe(dayChips[0])
    expect(activeChip?.textContent?.trim()).toBe('1')

    await harness.cleanup()
  })

  it('shows the day name only in the masthead heading', async () => {
    const harness = await renderScreen()

    const heading = harness.host.querySelector('.training-ledger__title')
    expect(heading?.textContent?.trim()).toBe('Push')

    const routineCard = harness.host.querySelector('.exercise-card')
    expect(routineCard?.querySelector('.exercise-card__group')).toBeNull()

    const chips = Array.from(harness.host.querySelectorAll('.day-chip'))
    expect(chips.length).toBeGreaterThan(1)
    for (const chip of chips) {
      expect((chip.textContent ?? '').toLowerCase()).not.toContain('push')
    }

    await harness.cleanup()
  })

  it('finds an exercise outside the selected routine and logs it in the active session', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Add exercise'))
    const searchInput = harness.host.querySelector(
      'input[aria-label="Search exercises"]',
    ) as HTMLInputElement | null

    expect(searchInput).not.toBeNull()
    await setInputValue(searchInput!, 'Back Squat')

    const result = getButtonByText(harness.host, 'Back Squat')
    await click(result)
    await waitFor(
      () => Boolean(findExerciseCardByTitle(harness.host, 'Back Squat')),
      'Selected exercise did not appear.',
    )

    const searchedCard = findExerciseCardByTitle(harness.host, 'Back Squat')
    expect(searchedCard).not.toBeNull()
    expect(
      searchedCard?.querySelector('.exercise-card__group')?.textContent?.trim(),
    ).toBe('Added today')

    await logSet(searchedCard!, '185', '5')
    await waitFor(
      () => searchedCard!.querySelectorAll('.set-pill').length === 1,
      'Searched exercise set did not appear after saving.',
    )

    const exerciseId = searchedCard!.dataset.exerciseId
    const entries = await readStored(() =>
      db.setEntries.where('exerciseId').equals(exerciseId!).toArray(),
    )
    expect(entries).toEqual([
      expect.objectContaining({
        weight: 185,
        reps: 5,
      }),
    ])

    await harness.cleanup()
  })

  it('logs a quick-entry set as a removable set pill without a success banner', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    await logSet(firstCard!, '95', '8')

    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 1,
      'Saved set did not appear as a set pill.',
    )

    const track = firstCard!.querySelector('.set-track')?.textContent ?? ''
    expect(track).toContain('95')
    expect(track).toContain('8')
    expect(harness.host.querySelector('.banner--success')).toBeNull()
    expect(harness.host.querySelector('.banner--error')).toBeNull()

    await harness.cleanup()
  })

  it('tracks work-set completion from logged sets', async () => {
    const harness = await renderScreen()

    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    await logSet(firstCard!, '95', '8')
    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 1,
      'First logged set did not appear.',
    )

    await logSet(firstCard!, '95', '8')
    await logSet(firstCard!, '95', '8')
    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 3,
      'Third logged set did not appear.',
    )

    expect(firstCard!.classList.contains('exercise-card--complete')).toBe(true)

    await harness.cleanup()
  })

  it('shows dated actual history and keeps unit-aware strength estimates in a disclosure', async () => {
    const harness = await renderScreen({ withBottomNav: true })

    const daysAgoIso = (days: number, hour: number) => {
      const date = new Date()
      date.setDate(date.getDate() - days)
      date.setHours(hour, 0, 0, 0)
      return date.toISOString()
    }

    let benchId = ''
    await act(async () => {
      const exercises = await readExercises()
      benchId =
        exercises.find((exercise) => exercise.name === 'Barbell Bench Press')?.id ?? ''
      await db.sessions.bulkAdd([
        { id: 'hist-old', startedAt: daysAgoIso(14, 9), endedAt: daysAgoIso(14, 10) },
        { id: 'hist-new', startedAt: daysAgoIso(7, 9), endedAt: daysAgoIso(7, 10) },
      ])
      await db.setEntries.bulkAdd([
        {
          id: 'hist-old-set',
          sessionId: 'hist-old',
          exerciseId: benchId,
          index: 0,
          weight: 185,
          reps: 5,
          isWarmup: false,
          completedAt: daysAgoIso(14, 10),
        },
        {
          id: 'hist-new-set',
          sessionId: 'hist-new',
          exerciseId: benchId,
          index: 0,
          weight: 190,
          reps: 5,
          isWarmup: false,
          completedAt: daysAgoIso(7, 10),
        },
      ])
    })
    expect(benchId).not.toBe('')

    const benchCard = findExerciseCardByTitle(harness.host, 'Barbell Bench Press')
    expect(benchCard).not.toBeNull()
    const historyButton = benchCard!.querySelector(
      'button[aria-label^="Open history for"]',
    ) as HTMLButtonElement | null
    expect(historyButton).not.toBeNull()
    await click(historyButton!)

    await waitFor(
      () => document.body.querySelectorAll('.history-row').length === 2,
      'History rows did not load into the sheet.',
    )
    await waitFor(
      () => Boolean(document.body.querySelector('.history-overview')),
      'History overview strip did not render.',
    )

    const overview = document.body.querySelector('.history-overview')
    expect(overview?.textContent).toContain('Best in shown history')
    expect(overview?.textContent).toContain('190 lb × 5')
    expect(overview?.textContent).toContain('Estimated 1RM 221.67 lb')
    expect(overview?.querySelector('svg.history-overview__spark')).not.toBeNull()
    expect(
      document.body.querySelector<HTMLDetailsElement>('.history-estimates')?.open,
    ).toBe(false)

    const rows = Array.from(document.body.querySelectorAll('.history-row'))
    expect(rows[0].textContent).toContain('190 lb × 5 reps')
    expect(rows[1].textContent).toContain('185 lb × 5 reps')
    expect(rows[0].querySelector('time')?.getAttribute('datetime')).toBe(daysAgoIso(7, 9))

    await harness.cleanup()
  })

  it('removes a logged set when its remove control is pressed', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    await logSet(firstCard!, '135', '5')
    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 1,
      'Set pill did not appear before removal.',
    )

    const options = getButtonByText(firstCard!, 'Options')
    expect(options.getAttribute('aria-expanded')).toBe('false')
    expect(firstCard!.querySelector('.set-pill__remove')).toBeNull()
    expect(firstCard!.querySelector('.notes-input')).toBeNull()
    await click(options)
    expect(options.getAttribute('aria-expanded')).toBe('true')
    expect(firstCard!.querySelector('.notes-input')).not.toBeNull()

    const removeButton = firstCard!.querySelector(
      '.set-pill__remove',
    ) as HTMLButtonElement | null
    expect(removeButton).not.toBeNull()
    await click(removeButton!)

    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 0,
      'Set pill was not removed after pressing remove.',
    )

    await harness.cleanup()
  })

  it('uses a finished workout for progression and excludes unfinished performance', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    // Seeded exercises target three work sets; log all three below the rep ceiling.
    await logSet(firstCard!, '100', '6')
    await logSet(firstCard!, '100', '6')
    await logSet(firstCard!, '100', '6')

    await click(getButtonByText(firstCard!, 'Options'))
    expect(getButtonByText(firstCard!, 'Options').getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(firstCard!.querySelector('.suggestion')).toBeNull()
    await click(getButtonByText(harness.host, 'Finish workout'))

    await waitFor(
      () =>
        harness.host.querySelector('.exercise-card') !== firstCard &&
        (harness.host.querySelector('.last-line')?.textContent ?? '').includes('100 lb'),
      'The next workout did not load completed previous performance.',
    )
    const nextCard = harness.host.querySelector<HTMLElement>('.exercise-card')!
    expect(nextCard.querySelector('.suggestion')).toBeNull()
    expect(getButtonByText(nextCard, 'Options').getAttribute('aria-expanded')).toBe(
      'false',
    )
    await click(getButtonByText(nextCard, 'Options'))
    await waitFor(
      () => Boolean(nextCard.querySelector('.suggestion')),
      'Progression suggestion did not surface for the completed workout.',
    )

    expect(nextCard.querySelector('.suggestion')?.textContent).toContain('Keep 100 lb')
    expect(nextCard.querySelector('.suggestion')?.textContent).toContain('7 reps')
    await click(getButtonByText(nextCard, 'Options'))
    expect(nextCard.querySelector('.suggestion')).toBeNull()

    await harness.cleanup()
  })

  it('shows inline saved feedback on the save action after logging a set', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    const saveButton = firstCard!.querySelector(
      '.quick-entry__save',
    ) as HTMLButtonElement | null
    expect(saveButton?.textContent?.trim()).toBe('Complete set')

    await logSet(firstCard!, '100', '8')

    await waitFor(
      () =>
        (firstCard!.querySelector('.save-state')?.textContent ?? '').trim() ===
        'Saved on this device',
      'Save action did not surface saved feedback.',
    )

    await harness.cleanup()
  })

  it('keeps history as an icon action outside the quick-entry fields', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    const historyButton = getButtonByAriaLabelPrefix(firstCard!, 'Open history for')
    expect(historyButton).not.toBeNull()
    expect(firstCard!.querySelector('.quick-entry')?.contains(historyButton)).toBe(false)

    await harness.cleanup()
  })

  it('does not blur the active quick-entry input when saving a set', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    const weightInput = firstCard!.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement
    const repsInput = firstCard!.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement
    const saveButton = firstCard!.querySelector('.quick-entry__save') as HTMLButtonElement

    await act(async () => {
      repsInput.focus()
    })
    expect(document.activeElement).toBe(repsInput)

    let blurCount = 0
    repsInput.addEventListener('blur', () => {
      blurCount += 1
    })

    await setInputValue(weightInput, '95')
    await setInputValue(repsInput, '8')
    await click(saveButton)

    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 1,
      'Set was not logged.',
    )

    expect(blurCount).toBe(0)
    await harness.cleanup()
  })

  it('does not scroll the screen area when a valid set is saved', async () => {
    const harness = await renderScreen()
    const firstCard = harness.host.querySelector('.exercise-card') as HTMLElement | null
    expect(firstCard).not.toBeNull()

    // Flush the mount-time scroll-reset frame before observing save-related scrolling.
    await flushFrame()
    const scrollSpy = vi.fn()
    harness.host.scrollTo = scrollSpy as unknown as typeof harness.host.scrollTo

    await logSet(firstCard!, '105', '7')
    await waitFor(
      () => firstCard!.querySelectorAll('.set-pill').length === 1,
      'Set was not logged.',
    )

    expect(scrollSpy).not.toHaveBeenCalled()
    await harness.cleanup()
  })

  it('keeps empty completion errors beside the fields without moving away from the exercise', async () => {
    const harness = await renderScreen()
    const cards = Array.from(
      harness.host.querySelectorAll('.exercise-card'),
    ) as HTMLElement[]
    const lastCard = cards.at(-1)
    expect(lastCard).not.toBeUndefined()
    await click(lastCard!.querySelector('.exercise-card__title-btn')!)
    await flushFrame()

    const saveButton = lastCard!.querySelector('.quick-entry__save') as HTMLButtonElement

    const scrollSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === 'object' && typeof options?.top === 'number') {
        harness.host.scrollTop = options.top
      }
    })
    harness.host.scrollTo = scrollSpy as unknown as typeof harness.host.scrollTo
    harness.host.scrollTop = 640

    await click(saveButton)

    await waitFor(
      () =>
        (lastCard!.querySelector('[role="alert"]')?.textContent ?? '').includes(
          'Enter a weight of 0 or more',
        ),
      'Empty save validation error did not render.',
    )

    const weightInput = lastCard!.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement
    expect(weightInput.getAttribute('aria-invalid')).toBe('true')

    // Typing clears the inline invalid state.
    await setInputValue(weightInput, '95')
    expect(weightInput.getAttribute('aria-invalid')).toBe(null)

    expect(scrollSpy).not.toHaveBeenCalled()
    expect(harness.host.scrollTop).toBe(640)
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
    await waitFor(
      () => scrollSpy.mock.calls.length > 0,
      'Scroll reset was not triggered for edit mode.',
    )
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })

    scrollSpy.mockClear()
    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(
      () => scrollSpy.mock.calls.length > 0,
      'Scroll reset was not triggered for today mode.',
    )
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })

    await harness.cleanup()
  })

  it('keeps advanced exercise settings hidden until one row is opened', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const benchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    expect(benchRow).not.toBeNull()
    expect(benchRow?.textContent).not.toContain('Rep min')
    expect(benchRow?.querySelector('select')).toBeNull()

    await click(getButtonByTextWithin(benchRow!, 'Advanced'))
    await waitFor(
      () =>
        (benchRow?.textContent ?? '').includes('Rep min') &&
        Boolean(benchRow?.querySelector('select')),
      'Advanced exercise settings did not appear after opening a row.',
    )

    expect(benchRow?.textContent).toContain('Rep max')
    expect(benchRow?.textContent).toContain('Work sets')
    expect(benchRow?.textContent).toContain('Increment')

    const overheadRow = findEditRowByTitle(harness.host, 'Overhead Press')
    expect(overheadRow?.textContent).not.toContain('Rep min')

    await harness.cleanup()
  })

  it('closes advanced exercise settings when leaving edit mode and switching routines', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const benchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    await click(getButtonByTextWithin(benchRow!, 'Advanced'))
    await waitFor(
      () => (benchRow?.textContent ?? '').includes('Rep min'),
      'Advanced did not open.',
    )

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Today mode did not open.',
    )
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not reopen.',
    )

    const reopenedBenchRow = findEditRowByTitle(harness.host, 'Barbell Bench Press')
    expect(reopenedBenchRow?.textContent).not.toContain('Rep min')

    await click(getButtonByText(harness.host, '4 day'))
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Day 2') !== null,
      '4-day cards missing.',
    )
    await click(getButtonByTextIncludes(harness.host, 'Day 2')!)
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, 'Leg Press')),
      'Day 2 did not render.',
    )

    const legPressRow = findEditRowByTitle(harness.host, 'Leg Press')
    expect(legPressRow?.textContent).not.toContain('Rep min')

    await harness.cleanup()
  })

  it('creates a new exercise on the first add when the text does not match an existing exercise', async () => {
    const harness = await renderScreen()
    const revealedRows: HTMLElement[] = []
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      revealedRows.push(this)
    })
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    await click(getButtonByText(harness.host, 'Edit'))

    try {
      await waitFor(
        () => Boolean(harness.host.querySelector('.edit-mode')),
        'Edit mode did not open.',
      )
      const exercisesBefore = await readExercises()

      const uniqueName = `Codex Exercise ${Date.now()}`
      const addInput = harness.host.querySelector(
        'input[placeholder="Add exercise"]',
      ) as HTMLInputElement
      await setInputValue(addInput, uniqueName)
      await click(getButtonByText(harness.host, 'Add'))

      await waitFor(
        () => Boolean(findEditRowByTitle(harness.host, uniqueName)),
        'Added exercise did not appear on the first add.',
      )
      await waitFor(
        () => scrollIntoView.mock.calls.length > 0,
        'Added exercise row was not revealed.',
      )

      expect(revealedRows).toContain(findEditRowByTitle(harness.host, uniqueName))
      const exercisesAfter = await readExercises()
      expect(exercisesAfter).toHaveLength(exercisesBefore.length + 1)
      expect(exercisesAfter.some((exercise) => exercise.name === uniqueName)).toBe(true)
    } finally {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView
      await harness.cleanup()
    }
  })

  it('keeps unsaved exercise drafts when leaving and returning to edit mode', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const uniqueName = `Unsaved Probe ${Date.now()}`
    const addInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement
    await setInputValue(addInput, uniqueName)
    await click(getButtonByText(harness.host, 'Add'))
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, uniqueName)),
      'Draft did not appear.',
    )

    await click(getButtonByText(harness.host, 'Today'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Today mode did not open.',
    )
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not reopen.',
    )

    expect(findEditRowByTitle(harness.host, uniqueName)).not.toBeNull()
    await harness.cleanup()
  })

  it('saves routine additions for the next workout while preserving the active plan', async () => {
    const harness = await renderScreen()
    await logSet(harness.host.querySelector('.exercise-card')!, '100', '8')
    const initialIds = Array.from(
      harness.host.querySelectorAll<HTMLElement>('.exercise-card'),
    ).map((card) => card.dataset.exerciseId)
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const uniqueName = `Saved Probe ${Date.now()}`
    const addInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement
    await setInputValue(addInput, uniqueName)
    await click(getButtonByText(harness.host, 'Add'))
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, uniqueName)),
      'Draft did not appear.',
    )

    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Save did not return to today.',
    )
    expect(findExerciseCardByTitle(harness.host, uniqueName)).toBeNull()
    expect(
      Array.from(harness.host.querySelectorAll<HTMLElement>('.exercise-card')).map(
        (card) => card.dataset.exerciseId,
      ),
    ).toEqual(initialIds)
    await click(getButtonByText(harness.host, 'Finish workout'))
    await waitFor(
      () => Boolean(findExerciseCardByTitle(harness.host, uniqueName)),
      'Saved routine addition was not used for the next workout.',
    )
    await harness.cleanup()
  })

  it('reuses an existing exercise record on an exact-name add', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const exercisesBefore = await readExercises()
    const rowsBefore = harness.host.querySelectorAll('.edit-exercise').length
    const addInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement

    await setInputValue(addInput, 'bench press')
    await click(getButtonByText(harness.host, 'Add'))

    await waitFor(
      () => harness.host.querySelectorAll('.edit-exercise').length === rowsBefore + 1,
      'Exact-name add did not reuse the existing exercise.',
    )

    const exercisesAfter = await readExercises()
    expect(exercisesAfter).toHaveLength(exercisesBefore.length)
    expect(findEditRowByTitle(harness.host, 'Bench Press')).not.toBeNull()

    await harness.cleanup()
  })

  it('reuses an existing exercise from an inline suggestion', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const exercisesBefore = await readExercises()
    const rowsBefore = harness.host.querySelectorAll('.edit-exercise').length
    const addInput = harness.host.querySelector(
      'input[placeholder="Add exercise"]',
    ) as HTMLInputElement

    await setInputValue(addInput, 'bench')
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Bench Press') !== null,
      'Inline suggestion did not appear.',
    )
    await click(getButtonByTextIncludes(harness.host, 'Bench Press')!)

    await waitFor(
      () => harness.host.querySelectorAll('.edit-exercise').length === rowsBefore + 1,
      'Selecting a suggestion did not add the exercise.',
    )

    const exercisesAfter = await readExercises()
    expect(exercisesAfter).toHaveLength(exercisesBefore.length)
    await harness.cleanup()
  })

  it('keeps the routine when delete confirmation is canceled', async () => {
    const harness = await renderScreen()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await click(getButtonByText(harness.host, 'Edit'))

    try {
      await waitFor(
        () => Boolean(harness.host.querySelector('.edit-mode')),
        'Edit mode did not open.',
      )
      const nameInput = harness.host.querySelector(
        '.panel label input',
      ) as HTMLInputElement
      const routineName = nameInput?.value ?? ''
      expect(routineName).not.toBe('')

      await click(getButtonByText(harness.host, 'Delete routine'))

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(harness.host.querySelector('.edit-mode')).not.toBeNull()
      expect(
        (harness.host.querySelector('.panel label input') as HTMLInputElement)?.value,
      ).toBe(routineName)
    } finally {
      confirmSpy.mockRestore()
      await harness.cleanup()
    }
  })

  it('does not blur the active edit input when saving a routine', async () => {
    const harness = await renderScreen()
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )

    const nameInput = harness.host.querySelector('.panel label input') as HTMLInputElement
    await act(async () => {
      nameInput.focus()
    })
    expect(document.activeElement).toBe(nameInput)

    let blurCount = 0
    nameInput.addEventListener('blur', () => {
      blurCount += 1
    })

    await act(async () => {
      await click(getButtonByText(harness.host, 'Save routine'))
    })
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Save did not return to today.',
    )

    expect(blurCount).toBe(0)
    await harness.cleanup()
  })

  it('keeps exercise identity and history attached when its name changes', async () => {
    const harness = await renderScreen()
    const exercisesBefore = await readExercises()
    const original = exercisesBefore.find((exercise) => exercise.name === 'Leg Press')!
    const historySet = {
      id: 'rename-history-set',
      sessionId: 'rename-history',
      exerciseId: original.id,
      index: 0,
      weight: 100,
      reps: 8,
      unit: 'lb' as const,
      isWarmup: false,
      completedAt: '2026-09-10T12:30:00Z',
    }
    await act(async () => {
      await db.sessions.put({
        id: 'rename-history',
        startedAt: '2026-09-10T12:00:00Z',
        endedAt: '2026-09-10T13:00:00Z',
      })
      await db.setEntries.put(historySet)
    })
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )
    await click(getButtonByText(harness.host, '4 day'))
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Day 2') !== null,
      '4-day cards missing.',
    )
    await click(getButtonByTextIncludes(harness.host, 'Day 2')!)
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, 'Leg Press')),
      'Day 2 did not render.',
    )

    const legPressRow = findEditRowByTitle(harness.host, 'Leg Press')
    await click(getButtonByTextWithin(legPressRow!, 'Advanced'))
    await waitFor(
      () => Boolean(legPressRow?.querySelector('label input')),
      'Advanced did not open.',
    )

    const nameInput = legPressRow?.querySelector('label input') as HTMLInputElement
    await setInputValue(nameInput, 'Hamstring Curl')
    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Save did not return to today.',
    )

    expect((await readStored(() => db.exercises.get(original.id)))?.name).toBe(
      'Hamstring Curl',
    )
    expect(await readStored(() => db.exercises.count())).toBe(exercisesBefore.length)
    expect(await readStored(() => db.setEntries.get(historySet.id))).toEqual(historySet)
    const day4 = (await readStored(() => db.routines.toArray())).find(
      (routine) => routine.splitId === '4-day-split' && routine.name.startsWith('Day 4'),
    )!
    expect(day4.exerciseIds).toContain(original.id)
    await harness.cleanup()
  })

  it('keeps two exercise identities distinct when renamed to the same name', async () => {
    const harness = await renderScreen()
    const exercisesBefore = await readExercises()
    const originalId = exercisesBefore.find(
      (exercise) => exercise.name === 'Leg Press',
    )!.id
    const otherId = exercisesBefore.find(
      (exercise) => exercise.name === 'Lying Hamstring Curl',
    )!.id
    await click(getButtonByText(harness.host, 'Edit'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.edit-mode')),
      'Edit mode did not open.',
    )
    await click(getButtonByText(harness.host, '4 day'))
    await waitFor(
      () => getButtonByTextIncludes(harness.host, 'Day 2') !== null,
      '4-day cards missing.',
    )
    await click(getButtonByTextIncludes(harness.host, 'Day 2')!)
    await waitFor(
      () => Boolean(findEditRowByTitle(harness.host, 'Leg Press')),
      'Day 2 did not render.',
    )

    const legPressRow = findEditRowByTitle(harness.host, 'Leg Press')
    await click(getButtonByTextWithin(legPressRow!, 'Advanced'))
    await waitFor(
      () => Boolean(legPressRow?.querySelector('label input')),
      'Advanced did not open.',
    )

    const nameInput = legPressRow?.querySelector('label input') as HTMLInputElement
    await setInputValue(nameInput, 'Lying Hamstring Curl')
    await click(getButtonByText(harness.host, 'Save routine'))
    await waitFor(
      () => Boolean(harness.host.querySelector('.train-today')),
      'Save did not return to today.',
    )

    await waitForAsync(async () => {
      const exercises = await readExercises()
      return (
        exercises.filter((exercise) => exercise.name === 'Lying Hamstring Curl')
          .length === 2
      )
    }, 'Renaming to an existing exercise name did not create an isolated record.')
    expect(await readStored(() => db.exercises.count())).toBe(exercisesBefore.length)
    expect((await readStored(() => db.exercises.get(originalId)))?.name).toBe(
      'Lying Hamstring Curl',
    )
    expect((await readStored(() => db.exercises.get(otherId)))?.name).toBe(
      'Lying Hamstring Curl',
    )
    expect(originalId).not.toBe(otherId)

    await harness.cleanup()
  })

  it('opens and closes the history sheet while locking bottom-nav interaction', async () => {
    const harness = await renderScreen({ withBottomNav: true })
    const historyButton = getButtonByAriaLabelPrefix(harness.host, 'Open history for')
    await click(historyButton, { timeStamp: 0 })

    await waitFor(
      () => Boolean(document.body.querySelector('.sheet')),
      'History sheet did not open.',
    )

    const nav = harness.nav
    expect(nav?.style.visibility).toBe('hidden')
    expect(nav?.style.pointerEvents).toBe('none')
    expect(document.body.style.overflow).toBe('')

    const backdrop = document.body.querySelector('.sheet-backdrop') as HTMLDivElement
    await click(backdrop, { timeStamp: 320 })

    await waitFor(
      () => !document.body.querySelector('.sheet'),
      'History sheet did not close.',
    )

    expect(nav?.style.visibility).toBe('')
    expect(nav?.style.pointerEvents).toBe('')
    await harness.cleanup()
  })

  it('explains the empty history state with next-step copy', async () => {
    const harness = await renderScreen({ withBottomNav: true })
    const historyButton = getButtonByAriaLabelPrefix(harness.host, 'Open history for')
    await click(historyButton)

    await waitFor(
      () => Boolean(document.body.querySelector('.sheet')),
      'History sheet did not open.',
    )
    await waitFor(
      () =>
        (document.body.textContent ?? '').includes('No history yet') &&
        (document.body.textContent ?? '').includes(
          'Finish a workout to see its recorded sets here.',
        ),
      'Empty history copy did not render.',
    )

    await harness.cleanup()
  })
})

async function renderScreen(options?: {
  withBottomNav?: boolean
}): Promise<RenderHarness> {
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
  mountedScreens.set(root, shell)
  await act(async () => {
    root.render(<RoutinesScreen />)
  })

  await waitFor(
    () =>
      Boolean(host.querySelector('.exercise-card') || host.querySelector('.empty-state')),
    'Training screen did not finish initial render.',
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
  if (!mountedScreens.has(root)) return
  await act(async () => {
    root.unmount()
  })
  mountedScreens.delete(root)
  shell.remove()
}

async function logSet(card: HTMLElement, weight: string, reps: string): Promise<void> {
  if (!card.querySelector('.quick-entry'))
    await click(card.querySelector('.exercise-card__title-btn')!)
  const nextSet = card.querySelector<HTMLButtonElement>('.next-set')
  if (nextSet) await click(nextSet)
  const count = card.querySelectorAll('.set-pill').length
  const weightInput = card.querySelector('input[inputmode="decimal"]') as HTMLInputElement
  const repsInput = card.querySelector('input[inputmode="numeric"]') as HTMLInputElement
  const saveButton = card.querySelector('.quick-entry__save') as HTMLButtonElement
  await setInputValue(weightInput, weight)
  await setInputValue(repsInput, reps)
  await click(saveButton)
  await waitFor(
    () => card.querySelectorAll('.set-pill').length === count + 1,
    'Completed set did not render.',
  )
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
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )
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
  return getButtonByText(container, label)
}

function getButtonByTextIncludes(
  container: ParentNode,
  labelPart: string,
): HTMLButtonElement | null {
  return (
    (Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').toLowerCase().includes(labelPart.toLowerCase()),
    ) as HTMLButtonElement | undefined) ?? null
  )
}

function getButtonByAriaLabelPrefix(
  container: ParentNode,
  prefix: string,
): HTMLButtonElement {
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
    (Array.from(container.querySelectorAll('.edit-exercise')).find(
      (row) => row.querySelector('.edit-exercise__name')?.textContent?.trim() === title,
    ) as HTMLElement | undefined) ?? null
  )
}

function findExerciseCardByTitle(
  container: ParentNode,
  title: string,
): HTMLElement | null {
  return (
    (Array.from(container.querySelectorAll('.exercise-card')).find(
      (card) => card.querySelector('.exercise-card__name')?.textContent?.trim() === title,
    ) as HTMLElement | undefined) ?? null
  )
}

async function waitFor(
  condition: () => boolean,
  failureMessage: string,
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
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
  timeoutMs = 1500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let complete = false
    await act(async () => {
      complete = await condition()
      if (!complete)
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })
    })
    if (complete) return
  }
  throw new Error(failureMessage)
}

async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

async function readExercises() {
  let exercises: Awaited<ReturnType<typeof listExercises>> = []
  await act(async () => {
    exercises = await listExercises()
  })
  return exercises
}

async function readStored<T>(read: () => Promise<T>): Promise<T> {
  let value!: T
  await act(async () => {
    value = await read()
  })
  return value
}

async function clearDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    db.exercises,
    db.routines,
    db.sessions,
    db.setEntries,
    async () => {
      await db.setEntries.clear()
      await db.sessions.clear()
      await db.routines.clear()
      await db.exercises.clear()
    },
  )
}
