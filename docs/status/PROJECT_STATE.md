# Project State

## Scope

- React dashboard (`src/*`) + Flask server (`app.py`) + admin page (`admin/admin.html`, `admin/admin-panel.js`).
- Goal: season-based data management/crawling and user dashboard views.
- 미사용 템플릿 레이아웃 정리 완료:
  - 제거됨: `layouts/authentication`, `layouts/billing`, `layouts/profile`, `layouts/rtl`, `layouts/notifications`
  - 제거됨: 미사용 템플릿 데이터/보조 컴포넌트(`layouts/dashboard/data/*`, `layouts/tables/data/*` 일부)
- Hall of fame page (`/hall-of-fame`): season-level 4 kings aggregation view.
- Tables page includes `성장력` metric (day-over-day `채굴 효율` delta).
- Open API manager-mode analytics (`fconline_openapi/*`) + dashboard Open API section.
- Squad page top section includes `베스트11 포지션 맵` + `지표 한눈에` (team advanced metrics from `last200.json`).
- Squad table player click navigates to player detail page (`/dashboard/:id/squad/player/:playerKey`).
- Analysis route (`/dashboard/:id/analysis`) is temporarily disabled; use squad route for Open API insights.
- Dashboard 상단 메타 블록(`구단주 / 조회 시즌 / 현재 진행 시즌`)은 제거된 상태.

## UI Theme/Persistence

- Material UI controller state is persisted to `localStorage` key: `md2-ui-controller`.
- Persisted keys include: `darkMode`, `miniSidenav`, `transparentSidenav`, `whiteSidenav`, `sidenavColor`, `transparentNavbar`, `fixedNavbar`, `layout`.
- RTL 방향 전환 기능은 미사용 정책으로 제거되었고, 앱은 LTR 고정으로 동작합니다.
- Dark mode contrast fixes are applied to:
  - `/tables` rank badge
  - `/hall-of-fame` king cards (desktop/mobile)
  - `/dashboard/:id/squad` quick metrics + player modal
  - `/dashboard/:id/squad/player` summary card/quick metrics
- Sidenav mini mode logo alignment:
  - brand icon is centered in collapsed width and brand label is not rendered in mini mode.

## Deployment Context

- Runtime host: UGREEN NAS DXP2800 (personal NAS).
- Process model: single Flask app serves React build + `/data/*` JSON.
- Scheduler source: internal APScheduler in `app.py` (no external NAS cron required).

## Read First (next session)

1. `docs/status/project_summary.md`
2. `docs/status/PROJECT_STATE.md`
3. `app.py`
4. `admin/admin.html`
5. `src/utils/seasonUtils.js`
6. `src/layouts/tables/index.js`
7. `src/layouts/dashboard/index.js`
8. `fconline_openapi/sync.py`
9. `fconline_openapi/analytics.py`
10. `src/layouts/dashboard-squad/index.js`
11. `src/layouts/dashboard-player/index.js`

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
  - See `docs/specs/weekly_report_schema.md`.
  - Mock sample: `public/data/mockup/weekly_report_2026_W08.json`.

## Open API Analytics Policy

- Data serving base:
  - Runtime JSON is served from `/data/*` (`DATA_BASE_DIR="data"` in `app.py`).
- Cache/artifact paths:
  - Cache root: `OPENAPI_CACHE_DIR` or default `.private/openapi_cache/` (not publicly served)
  - User analysis: `data/{season}/user/{id}/analysis/`
  - Files: `last200.json`, `shot_events_last200.json`, `player_usage_last200.json`, `squad_analysis_all.json`
  - Nickname resolution: prefer `config/managers.json:name` (batch path), fallback to latest daily file nickname fields.
  - Season range fallback: when `season_ranges[season]` is missing, infer start/end from `data/{season}/user/*/*_YYMMDD(_HHMM).json` (or `manifest.endDate`) before filtering matches.
- Squad analysis row identity/schema:
  - `squad_analysis_all.json` schemaVersion: `0.1.2`
  - Row stable key: `playerKey = String(spId)`
  - Row fields include `spId`, `spPosition`, `seasonId`, `playerName`, `positionName` (plus existing stats)
- Scheduler:
  - `crawl_openapi_chain`: every 2 hours at `:10` (even hours)
  - execution order: `run_full_crawl` -> `run_openapi_analytics_all`
  - A안 적용: `run_full_crawl`은 2시간마다 시간 스냅샷(`_YYMMDD_HHMM`)을 저장하되,
    테이블/개인 대시보드용 일별 발행(`_YYMMDD`, `current_crawl_display_data.json`, `manifest.json`)은 하루 1회만 수행
  - daily publish gate: 기본 `04:10` KST 이후 첫 실행 1회
  - marker file: `.private/locks/daily_publish_marker.json` (당일+시즌 중복 발행 방지)
  - `weekly_report`: every Thursday `05:05`
  - Lock files: `.private/locks/daily_crawl.lock`, `.private/locks/openapi.lock`
- Throttling:
  - Batch knobs (env): `OPENAPI_BATCH_MAX_MATCHES` (default `300`), `OPENAPI_BATCH_WINDOW_MATCHES` (default `200`, `all` 가능)
  - Per-user randomized delay env: `OPENAPI_BATCH_DELAY_MIN` (default `0.8`), `OPENAPI_BATCH_DELAY_MAX` (default `1.6`)
  - Daily publish gate env: `DAILY_PUBLISH_HOUR` (default `4`), `DAILY_PUBLISH_MINUTE` (default `10`)
  - 429/5xx retry handled by Open API client retry/backoff
- Failure mode:
  - Missing analysis JSON on dashboard shows `분석 데이터 준비 중`
  - Fetch hard-fail hides Open API section only (base dashboard stays intact)
  - Daily publish gate 시점에 크롤링 결과가 0건이면 marker를 갱신하지 않아 같은 날 다음 배치에서 재시도 가능

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
- CSP는 일반 페이지/관리자 페이지 분리 정책으로 적용됨.
- `CSP_REPORT_ONLY=1` 설정 시 차단 대신 `Content-Security-Policy-Report-Only`로 검증 가능.
- Admin session expiry policy:
  - `ADMIN_SESSION_TTL_MINUTES` (absolute)
  - `ADMIN_SESSION_IDLE_MINUTES` (idle timeout)
- Enable secure cookies in production: `SESSION_COOKIE_SECURE=1`.

## Deploy Files

- `app.py`
- `admin/admin.html`
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
