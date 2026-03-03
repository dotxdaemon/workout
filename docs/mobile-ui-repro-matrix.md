ABOUTME: Defines deterministic 390x844 reproduction and verification flows for mobile UI bug classes.
ABOUTME: Provides a single checklist for layout stability, history sheet behavior, and rename isolation.

# Mobile UI Repro Matrix (390x844)

## Environment

- Viewport: `390x844`
- Route: `/#/routines`
- Seed state: default routines present (3-day + 4-day)

## Bug Class A: Today-card clipping and unstable scroll composition

### Repro

1. Open `/#/routines`.
2. Scroll down in Today mode until multiple cards are partially visible.
3. Observe active day heading and top card while continuing to scroll.

### Expected

- Day heading stays in normal document flow.
- No card content is visually clipped under a sticky overlay.
- No horizontal drift while vertical scrolling.

### Automated coverage

- `src/screens/RoutinesScreen.layout.test.tsx`:
  - `keeps today active-day header non-sticky to prevent clipping artifacts`

## Bug Class B: History sheet lifecycle and nav non-interference

### Repro

1. In Today mode, tap the timer icon on an exercise card.
2. Verify history sheet opens.
3. Tap backdrop after guard delay to close.

### Expected

- Sheet opens reliably from timer icon.
- Bottom navigation is hidden and non-interactive while sheet is open.
- Backdrop close restores bottom navigation state.

### Automated coverage

- `src/screens/RoutinesScreen.layout.test.tsx`:
  - `opens and closes history sheet while locking bottom nav interaction`
- `src/lib/historySheet.test.ts`:
  - drag-allow, drag-threshold, and backdrop-guard logic

## Bug Class C: Cross-routine rename linkage

### Repro

1. Switch to Edit mode.
2. Select `4 day`.
3. Open `Day 2`.
4. Rename `Leg Press` to an existing exercise name (`Lying Hamstring Curl`).
5. Save routine.

### Expected

- Rename creates an isolated exercise record for that row.
- Other routines do not get reassigned or renamed.
- History for same-name exercises stays isolated by exercise id.

### Automated coverage

- `src/screens/RoutinesScreen.layout.test.tsx`:
  - `creates an isolated exercise record when renaming to an existing exercise name`
  - `does not rename exercises in other routines when one edit-row name changes`
- `src/lib/db.integration.test.ts`:
  - `keeps same-name exercises isolated for history and routine references`
