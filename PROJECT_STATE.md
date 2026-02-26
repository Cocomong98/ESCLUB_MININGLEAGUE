# Project State

## Scope
- React dashboard (`src/*`) + Flask server (`app.py`) + admin page (`admin.html`).
- Goal: season-based data management/crawling and user dashboard views.
- Hall of fame page (`/hall-of-fame`): season-level 4 kings aggregation view.
- Tables page includes `성장력` metric (day-over-day `채굴 효율` delta).

## Read First (next session)
1. `PROJECT_STATE.md`
2. `app.py`
3. `admin.html`
4. `src/utils/seasonUtils.js`
5. `src/layouts/tables/index.js`
6. `src/layouts/dashboard/index.js`

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
