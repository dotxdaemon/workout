2026-03-09
- Sean required a repo-local journal file.
- For every failed fix attempt or incorrect result, append what was tried and why it did not work before attempting the next fix.
2026-03-10
- Previously tried: no new fix attempt yet for this history-sheet bug in this run.
- Sean asked: fix the history bottom sheet because some exercises will not scroll down.
- Error after trying: not reproduced yet in this run; next step is to reproduce the failing exercise and capture the exact cause.
2026-03-10
- Previously tried: reproduced the history-sheet bug by seeding seven sessions for one exercise; the sheet still rendered only five rows.
- Sean asked: fix the exercises whose history sheet will not scroll down to older entries.
- Error after trying: `handleOpenHistorySheet()` fetched `listExerciseHistory(exercise.id, 5)`, so older sessions were never loaded into the modal and there was nothing below row five to scroll to.

2026-03-10
- Added persisted theme mode in Settings.
- Root cause: there was no theme preference in stored app settings and no app-level theme attribute or alternate token set to switch the UI.
- Result: Settings now saves dark/light mode, App applies it to the root element, and the UI tokens switch without touching workout logic.

2026-03-10
- Previously tried: added persisted theme mode that only writes when `Save settings` is pressed.
- Sean asked: make light mode toggle on and off directly with the switch.
- Error after trying: the theme buttons only changed local Settings state, so the UI theme did not switch or persist until the separate save button was pressed.

2026-03-10
- Tried making the theme toggle work immediately from the Settings switch.
- Root cause: the Light/Dark buttons only updated local component state; they did not call writePreferences or applyTheme, so the build stayed dark until Save settings.
- Result: theme changes now persist immediately on button press and the whole app follows the selected mode without waiting for Save settings.

2026-03-12
# Weekly retrospective for 2026-03-05 through 2026-03-12

## 1. What Sean asked for, and what bugs this week had to be fixed

### A. Bottom-nav, shell, and scroll behavior
- Sean asked repeatedly for the mobile shell to behave like a stable app:
  - bottom nav should stay at the bottom
  - bottom nav should not jump up after saving a set
  - bottom nav should not disappear in installed PWA mode
  - bottom nav should not overlap cards
  - bottom nav should not be translucent enough to show the content behind it
  - top controls should remain reachable after save flows
  - saving a set or saving a routine should not leave the page stuck so scrolling back up stops working
- The bugs that were caused during attempts this week were mostly self-inflicted shell regressions:
  - moving the nav into a clipped shell row made the nav depend on shell height being exactly right at startup
  - switching shell height units between percent height, `100dvh`, `100lvh`, and fallback combinations repeatedly changed which bug showed up:
    - nav above the physical bottom edge
    - nav missing at startup
    - nav rising after save
    - nav overlap with card content
  - using a sticky document footer made card content visible behind or under the nav
  - translucent footer styling made the bleed-through visible even when layout was otherwise correct
  - putting top spacing on the inner scroll container created an exposed strip above the sticky header where card content could be seen
  - save-flow scroll preservation and restore logic fought the user’s next real scroll gesture and made the screen feel stuck after the keyboard dismissed
  - the debugging failure pattern was as important as the code failure pattern: multiple fixes were proxy fixes, not the real device fix, so the same shell subsystem kept regressing

### B. History sheet not scrolling for some exercises
- Sean asked to fix history because some exercises would not scroll down to older sessions.
- The actual bug was not gesture handling. The sheet only fetched five sessions for the modal, so older sessions were never loaded at all.
- This created a misleading UX bug:
  - some exercises looked "broken"
  - the sheet would open
  - but there was nothing below row five, so dragging downward did not reveal more history because there was no more data in the DOM

### C. Add exercise requiring two attempts
- Sean asked to fix the routine editor because adding an exercise sometimes did nothing the first time.
- The bug was caused by the edit hydration effect rebuilding exercise drafts as soon as the new exercise changed `exerciseMap`.
- That meant:
  - the first add succeeded in the data layer
  - then the effect immediately reconstructed the draft list from the persisted routine
  - the brand-new draft row was wiped before it could remain visible
  - the user had to add it again, which made it look like the first add had failed

### D. Theme switch not working on the build
- Sean asked for light mode and then specifically said the switch was not working on the build.
- The first implementation added theme persistence, but only through `Save settings`.
- That introduced a UX bug:
  - tapping `Light` or `Dark` changed local React state only
  - the app theme did not actually switch immediately
  - the build looked broken because the toggle control itself did not behave like a real switch

## 2. What fixed each issue

### A. Bottom-nav, shell, and scroll behavior
- There was not one magic fix. The durable direction was treating nav, shell height, scroll ownership, and header spacing as one subsystem and then fixing specific failure modes with direct checks.
- The important fixes that actually addressed concrete symptoms were:
  - reserving a dedicated shell row for the bottom nav so cards do not render into the nav region
  - keeping `.screen-area` as the content scroller for the shell-row model when overlap had to be prevented
  - making the footer surface opaque so content cannot visually bleed through
  - moving top spacing off `.screen-area` and onto `.page` so the sticky header sits flush to the scroll port
  - removing or tightening save-time scroll restoration so delayed restore logic does not fight the next user scroll
  - adding direct repro scripts for:
    - nav overlap
    - nav opacity
    - startup nav visibility
    - header gap
    - nav jump during scroll
- The larger lesson from this cluster is that many earlier attempts did not fix the real problem even when local checks were green. The fixes that mattered were the ones tied to a symptom-specific repro script and a concrete shell-state measurement.

### B. History sheet not scrolling for some exercises
- The actual fix was simple:
  - keep the Today preview capped
  - remove the five-row cap from the history modal fetch path
- The history modal now loads the full exercise history while the collapsed preview still shows only a short summary.
- The key change was making the modal fetch "all rows for this exercise" instead of "five rows for this exercise."

### C. Add exercise requiring two attempts
- The fix was to stop rehydrating edit drafts from the routine every time `exerciseMap` changed.
- Draft hydration now happens when entering edit mode or switching routines, not every time a newly created exercise touches the exercise map.
- That keeps the first added draft row visible immediately after pressing `Add`.

### D. Theme switch not working on the build
- The fix was to make the switch behave like a switch instead of a deferred form field.
- Tapping `Light` or `Dark` now:
  - updates the local preferences state
  - writes the theme preference immediately
  - applies the selected theme to the app immediately
- `Save settings` still exists for other settings, but the theme no longer waits for that button.

## 3. Notes for future tests

### A. Bottom-nav, shell, and scroll regression tests
- Keep a full nav regression matrix for every shell change. A shell change is any change to:
  - `.app-shell`
  - `.screen-area`
  - `.bottom-nav`
  - safe-area padding
  - viewport height units
- Required checks for every future nav or scroll fix:
  - startup nav visible on load
  - nav reaches the physical bottom edge
  - nav does not rise with scroll or save flows
  - nav does not overlap card content
  - nav surface is opaque
  - no exposed strip above the sticky routines header
  - after keyboard dismissal from `Save` and `Save routine`, upward scrolling works immediately
  - `Today / Edit` remains reachable after save flows
- Required runtime metrics to capture during nav debugging:
  - nav rect top, bottom, and height
  - visible overlap amount
  - scroll owner and its `scrollTop`
  - `visualViewport.scale`
  - shell padding and safe-area values
- Required device/viewport coverage:
  - `390x844`
  - installed PWA startup
  - save flow with keyboard open and dismissed
  - scroll while cards are near the nav
- Important testing rule:
  - do not trust a green local proxy test alone for iPhone shell bugs
  - keep the local scripts, but treat them as partial evidence unless the user-visible symptom also matches

### B. History sheet tests
- Seed more than five sessions for a single exercise and assert that:
  - the modal renders all rows
  - the sheet is actually scrollable
  - older rows are reachable
- Keep separate tests for:
  - empty history state
  - exactly five sessions
  - more than five sessions
  - backdrop close
  - swipe-down close
  - bottom-nav non-interference while the sheet is open

### C. Routine editor tests
- Keep a first-add regression:
  - type exercise name
  - press `Add`
  - assert the new row appears immediately on the first attempt
- Add a second regression for:
  - create two exercises in one edit session
  - assert both rows remain visible
  - assert saving the routine preserves both rows

### D. Theme switch tests
- Keep a direct behavior test for the switch itself:
  - clicking `Light` immediately sets `data-theme=\"light\"`
  - clicking `Dark` immediately sets `data-theme=\"dark\"`
  - neither action should require `Save settings`
- Add a cross-screen proof:
  - switch theme in Settings
  - navigate to Routines
  - assert the root token set changed there too
- Keep a persistence check:
  - reload app
  - assert the last selected theme is still active

### E. Process notes for future work
- Do not treat shell, nav, and scroll bugs as independent unless the repro proves they are independent.
- Do not swap viewport units reactively in hopes that one of them will fix the symptom.
- Do not call something fixed unless the exact user-visible symptom has been retested.
- Keep journal entries tied to:
  - what Sean asked for
  - what hypothesis was tried
  - why it failed or why it worked
- The journal is the memory of failed hypotheses; it should stop repeated attempts, especially for the nav and shell subsystem.
