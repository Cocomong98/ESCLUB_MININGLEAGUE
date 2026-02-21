# Repository Agent Instructions

## Startup Checklist (Required)

1. Read `project_summary.md` first.
2. Then read `PROJECT_STATE.md`.
3. If there is a conflict, prefer the newer file and mention the mismatch in the next response.

## Changelog Policy

- Every commit should be reflected in `CHANGELOG.md`.
- Automatic updates are handled by:
  - `.githooks/prepare-commit-msg`
  - `scripts/update_changelog_auto.sh`
- Do not remove these markers from `CHANGELOG.md`:
  - `<!-- auto-commit-log:start -->`
  - `<!-- auto-commit-log:end -->`

## Summary Maintenance

- When architecture, API behavior, deploy flow, or data path changes, update `project_summary.md` in the same task.
