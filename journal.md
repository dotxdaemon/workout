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
