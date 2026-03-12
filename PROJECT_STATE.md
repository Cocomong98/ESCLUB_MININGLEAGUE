# Project State

## Scope

- React dashboard (`src/*`) + Flask server (`app.py`) + admin page (`admin.html`, `admin-panel.js`).
- Goal: season-based data management/crawling and user dashboard views.
- Hall of fame page (`/hall-of-fame`): season-level 4 kings aggregation view.
- Tables page includes `성장력` metric (day-over-day `채굴 효율` delta).
- Open API manager-mode analytics (`fconline_openapi/*`) + dashboard Open API section.
- Squad page top section includes `베스트11 포지션 맵` + `지표 한눈에` (team advanced metrics from `last200.json`).
- Squad table player click navigates to player detail page (`/dashboard/:id/squad/player/:playerKey`).
- Analysis route (`/dashboard/:id/analysis`) is temporarily disabled; use squad route for Open API insights.

## Deployment Context

- Runtime host: UGREEN NAS DXP2800 (personal NAS).
- Process model: single Flask app serves React build + `/data/*` JSON.
- Scheduler source: internal APScheduler in `app.py` (no external NAS cron required).

## Read First (next session)

1. `PROJECT_STATE.md`
2. `app.py`
3. `admin.html`
4. `src/utils/seasonUtils.js`
5. `src/layouts/tables/index.js`
6. `src/layouts/dashboard/index.js`
7. `fconline_openapi/sync.py`
8. `fconline_openapi/analytics.py`
9. `src/layouts/dashboard-squad/index.js`
10. `src/layouts/dashboard-player/index.js`

## Current Season Rules

- Crawl save target season:
  - Determined by current datetime in `season_ranges` (`app.py`).
  - If overlap, newer season wins.
- Dashboard data window:
  - If selected season is current season: last 5 days from today.
  - If ended season: last 5 days from `manifest.endDate`.
- Tables -> Dashboard passes season via query:
  - `/dashboard/:id?season=<season>`

## Admin Features

- Tabs: member management / season management.
- Auth: session-based (`/api/login`), not query-string password.
- Season create fields:
  - `year`, `part`, `startDate`, `startTime`, `endDate`, `endTime`
  - Season name auto-generated as `YYYY-N`.
- Season update:
  - Inline edit for start/end date+time per season row.
- Validation:
  - Backend rejects invalid ranges and overlaps with clear error message.
  - UI shows toast errors.

## Time Granularity

- Season split/validation uses hour-level semantics.
- Time inputs normalized to `HH:00`.
- Crawl writes:
  - Hour snapshot: `player_YYMMDD_HHMM.json`
  - Daily compatibility file: `player_YYMMDD.json`

## Weekly Report Policy (Approved)

- Weekly window (KST):
  - Start: Thursday `05:00:00`
  - End: next Thursday `04:59:59`
  - Batch run target: Thursday `05:05`
  - Execution: internal APScheduler job in `app.py` (no separate NAS scheduler)
- Season boundary handling:
  - If a weekly range crosses seasons, split by season and aggregate.
  - If cumulative metrics reset (`end < start`), treat as new-season reset.
- Missing data policy:
  - No imputation (`imputation = none`).
  - Require boundary points for weekly delta metrics.
  - Use eligibility thresholds (minimum valid days) for KPI candidates.
- KPI minimum sample policy:
  - Weekly kings use minimum weekly games `>= 500`.
  - This rule is for weekly report only.
  - Existing season kings logic (`current_crawl_display_data.json`) must remain unchanged.
- Schema contract:
  - See `WEEKLY_REPORT_SCHEMA.md`.
  - Mock sample: `public/data/mockup/weekly_report_2026_W08.json`.

## Open API Analytics Policy

- Data serving base:
  - Runtime JSON is served from `/data/*` (`DATA_BASE_DIR="data"` in `app.py`).
- Cache/artifact paths:
  - Cache root: `OPENAPI_CACHE_DIR` or default `.private/openapi_cache/` (not publicly served)
  - User analysis: `data/{season}/user/{id}/analysis/`
  - Files: `last200.json`, `shot_events_last200.json`, `player_usage_last200.json`, `squad_analysis_all.json`
  - Nickname resolution: prefer `managers.json:name` (batch path), fallback to latest daily file nickname fields.
  - Season range fallback: when `season_ranges[season]` is missing, infer start/end from `data/{season}/user/*/*_YYMMDD(_HHMM).json` (or `manifest.endDate`) before filtering matches.
- Squad analysis row identity/schema:
  - `squad_analysis_all.json` schemaVersion: `0.1.2`
  - Row stable key: `playerKey = String(spId)`
  - Row fields include `spId`, `spPosition`, `seasonId`, `playerName`, `positionName` (plus existing stats)
- Scheduler:
  - `daily_crawl`: every day `04:00` (run_full_crawl only)
  - `openapi_analytics`: every 2 hours at `:10` (run_openapi_analytics_all)
  - `weekly_report`: every Thursday `05:05`
  - Lock files: `.private/locks/daily_crawl.lock`, `.private/locks/openapi.lock`
- Throttling:
  - Batch knobs (env): `OPENAPI_BATCH_MAX_MATCHES` (default `300`), `OPENAPI_BATCH_WINDOW_MATCHES` (default `200`, `all` 가능)
  - Per-user randomized delay env: `OPENAPI_BATCH_DELAY_MIN` (default `0.8`), `OPENAPI_BATCH_DELAY_MAX` (default `1.6`)
  - 429/5xx retry handled by Open API client retry/backoff
- Failure mode:
  - Missing analysis JSON on dashboard shows `분석 데이터 준비 중`
  - Fetch hard-fail hides Open API section only (base dashboard stays intact)

## Backend APIs

- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET/POST /api/managers`
- `GET/POST /api/seasons`
- `POST /api/seasons/split` (compat)
- `PUT /api/seasons/<season>`
- `GET /api/history/<season>/<player_id>`

## Security Notes

- `ADMIN_PASSWORD` must be provided via environment variable.
- `FLASK_SECRET_KEY` should be set in production.
- Admin session expiry policy:
  - `ADMIN_SESSION_TTL_MINUTES` (absolute)
  - `ADMIN_SESSION_IDLE_MINUTES` (idle timeout)
- Enable secure cookies in production: `SESSION_COOKIE_SECURE=1`.

## Deploy Files

- `app.py`
- `admin.html`
- `build/index.html`
- `build/static/*`

## Quick Validation Commands

```bash
python3 -m py_compile app.py
npx eslint src/layouts/dashboard/index.js src/layouts/tables/index.js src/utils/seasonUtils.js
npm run build
```

## OpenAPI CLI

- `python app.py openapi-selftest`
- `python app.py openapi-sync-user --season <YYYY-N> --id <PLAYER_ID> [--max-matches 1200] [--refresh-ouid]`
- `python app.py openapi-update-analysis --season <YYYY-N> --id <PLAYER_ID> [--max-matches 1200] [--window-matches N|all] [--refresh-ouid]`
