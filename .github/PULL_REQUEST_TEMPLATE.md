ABOUTME: Defines mandatory bugfix evidence sections for pull requests.
ABOUTME: Makes missing root-cause and verification artifacts visible in review.

# Bugfix Evidence Template

Use this template for bugfix work. Missing required sections should fail review.

## Root cause (one sentence)
[required] Describe one concrete root cause.

## Reproduction steps
[required] List exact user-reported steps used to reproduce.

## Failing test (name + output snippet)
[required] Include the test name and a short failing output snippet.

## Passing test output snippet
[required] Include a short snippet proving the same test now passes.

## Files changed
[required] List changed files relevant to this bugfix.

## What was removed/neutralized
[required] Describe what risky path or behavior was removed/neutralized.

## Acceptance checklist (PASS/FAIL)
[required] Mark each item PASS/FAIL with evidence.

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Reproduced exact bug flow first |  |  |
| Root cause stated before fix |  |  |
| Failing regression test added first |  |  |
| Same test passes after fix |  |  |
| npm test |  |  |
| npm run lint |  |  |
| npm run typecheck |  |  |
| Mobile checks at 390x844 (if UI) |  |  |

## Verification command outputs
[required] Include command outputs with exit codes for:
- `npm test`
- `npm run lint`
- `npm run typecheck`

## Screenshot paths (before/after for UI bugs)
[required for UI changes] Provide both paths at same viewport.

Before:

After:
