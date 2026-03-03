ABOUTME: Tracks recurring bug classes with root causes and regression test coverage.
ABOUTME: Requires linking each bugfix to failing tests and acceptance evidence.

# Bug Regression Map

Use this map to prevent repeat regressions. Every bugfix should add or update an entry.

## Entry format

| Date (YYYY-MM-DD) | Symptom | Root cause (1 sentence) | Failing test name | Fix commit | Acceptance evidence links |
|---|---|---|---|---|---|
| 2026-03-03 | Edit -> Today mode switch opened mid-list after save | Shared `.screen-area` scroll position was not reset on mode change, so stale scroll offset persisted. | `resets screen-area scroll when switching between today and edit modes` | `0134ad4` | Before: `/tmp/weird-after-save-today.png`, After: `/tmp/weird-after-save-fixed.png` |
| 2026-03-03 | Top Today card appears clipped during scroll on mobile | `position: sticky` on `.today-active-day-header` over a touch-scrolling container caused overlay clipping artifacts. | `keeps today active-day header non-sticky to prevent clipping artifacts` | `e9030e4` | Before: `/tmp/workout-before.png`, After: `/tmp/workout-after.png` |
| 2026-03-03 | Renaming an exercise row can relink to another routine's exercise | Edit-save logic reused existing exercise ids by name, and duplicate-name merge/history linking collapsed intended isolation. | `creates an isolated exercise record when renaming to an existing exercise name` | `e9030e4` | Repro matrix: `/Users/seankim/workout/docs/mobile-ui-repro-matrix.md` |
| 2026-03-03 | Settings panels clipped on the right at mobile width | `.page` grid used implicit max-content sizing and native file input intrinsic width forced overflow in settings panel layout. | `settings page grid uses constrained single column track` | `pending` | Before: `/tmp/settings-before.png`, After: `/tmp/settings-after.png` |

## Rules

1. Add one row per bug class; update existing rows when behavior changes.
2. Include the exact failing test name that captured the bug first.
3. Include the commit hash that fixed the bug.
4. Link acceptance evidence (logs/screenshots/PR artifacts).
