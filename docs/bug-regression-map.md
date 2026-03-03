ABOUTME: Tracks recurring bug classes with root causes and regression test coverage.
ABOUTME: Requires linking each bugfix to failing tests and acceptance evidence.

# Bug Regression Map

Use this map to prevent repeat regressions. Every bugfix should add or update an entry.

## Entry format

| Date (YYYY-MM-DD) | Symptom | Root cause (1 sentence) | Failing test name | Fix commit | Acceptance evidence links |
|---|---|---|---|---|---|
| 2026-03-03 | Edit -> Today mode switch opened mid-list after save | Shared `.screen-area` scroll position was not reset on mode change, so stale scroll offset persisted. | `resets screen-area scroll when switching between today and edit modes` | `0134ad4` | Before: `/tmp/weird-after-save-today.png`, After: `/tmp/weird-after-save-fixed.png` |

## Rules

1. Add one row per bug class; update existing rows when behavior changes.
2. Include the exact failing test name that captured the bug first.
3. Include the commit hash that fixed the bug.
4. Link acceptance evidence (logs/screenshots/PR artifacts).
