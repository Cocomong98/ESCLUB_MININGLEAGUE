# Repository Agent Instructions

## Language And Response Style

- Always respond in Korean unless the user explicitly asks for another language.
- Use concise, execution-first updates.
- For "what should I do?" questions, answer with ordered steps.

## Startup Checklist (Required)

1. Read `docs/status/project_summary.md` first.
2. Then read `docs/status/PROJECT_STATE.md`.
3. If there is a conflict, prefer the newer file and report the mismatch briefly.

## Branch And PR Policy

- Treat `master` as the default production branch.
- Do not push directly to `master` unless explicitly requested.
- Preferred flow:
  - `add-*` (feature branch) -> `release/*` -> `master`
- When requested, split commits by functional scope (security/frontend/deps/docs/deploy).

## Commit And Changelog Policy

- Every commit should be reflected in `CHANGELOG.md`.
- Automatic updates are handled by:
  - `.githooks/prepare-commit-msg`
  - `scripts/update_changelog_auto.sh`
- Do not remove these markers from `CHANGELOG.md`:
  - `<!-- auto-commit-log:start -->`
  - `<!-- auto-commit-log:end -->`

## Deployment And Secrets Policy

- Never commit real secrets.
- Use `.env` for runtime secrets (`ADMIN_PASSWORD`, `FLASK_SECRET_KEY`, etc.).
- Keep `docker-compose.yaml` out of git tracking.
- Keep `docker-compose.example.yaml` as the repository template.

## Data File Policy

- Runtime data must not be tracked in git:
  - `data/*`
  - `public/data/*`
- Keep only minimal mockup fixtures for bootstrap/testing:
  - `data/.gitkeep`
  - `public/data/mockup/**`

## Summary Maintenance

- When architecture, API behavior, deploy flow, or data path changes, update `docs/status/project_summary.md` in the same task.
