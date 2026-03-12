# ESCLUB MINING LEAGUE 대시보드

FC ONLINE 클럽원 데이터를 시즌 단위로 수집/집계하고, 순위/대시보드/스쿼드 분석까지 조회하는 React + Flask 통합 서비스입니다.

## 개요

- 프론트엔드: React(MUI, Chart.js, React Router)
- 백엔드: Flask 단일 앱(`app.py`)
- 데이터: `data/{season}/...` JSON 파일 기반
- 운영 환경: UGREEN NAS DXP2800 (단일 컨테이너/프로세스)
- 관리자 화면: `admin.html` + 외부 스크립트 `admin-panel.js`

## 핵심 페이지

- `/tables`: 시즌 순위표(순위/승률/판수/채굴 효율/성장력/구단가치)
- `/dashboard/:id`: 개인 지표 카드 + 최근 5일 차트
- `/dashboard/:id/analysis`: 임시 비활성화 (라우트 보류)
- `/dashboard/:id/squad`: 베스트11 포지션 맵 + 지표 한눈에
- `/hall-of-fame`: 시즌별 4대 왕 지표
- `/admin.html`: 관리자(세션 로그인, 시즌/구단주 관리)

## UI 상태/테마 정책

- 다크모드/사이드바 상태는 `localStorage`의 `md2-ui-controller` 키로 유지됩니다.
- 새로고침 후에도 다크모드가 유지되어야 정상 동작입니다.
- 다크모드에서 텍스트 가독성(순위 배지/카드/모달)은 라이트 모드와 동일 수준으로 보정되어 있습니다.

## 런타임 데이터 경로

- 시즌 집계: `data/{season}/current_crawl_display_data.json`
- 개인 일별: `data/{season}/user/{id}/{id}_YYMMDD.json`
- Open API 분석: `data/{season}/user/{id}/analysis/*.json`
- 시즌 설정: `season_config.json`
- 구단주 목록: `managers.json`

`season_config.json`은 루트 파일을 기준으로 운영하며, `public/season_config.json`은 동기화 사본으로만 유지합니다.

## 환경 변수(.env)

필수/권장 값은 `.env.example`을 기준으로 관리합니다.

- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `FLASK_SECRET_KEY`: Flask 세션 서명 키
- `SESSION_COOKIE_SECURE`: HTTPS 환경이면 `1`
- `ADMIN_SESSION_TTL_MINUTES`: 관리자 세션 절대 만료(분)
- `ADMIN_SESSION_IDLE_MINUTES`: 관리자 세션 유휴 만료(분)
- `NEXON_OPEN_API_KEY`: Nexon Open API 키
- `OPENAPI_CACHE_DIR`: Open API 캐시 루트(미지정 시 `./.private/openapi_cache`)
- `OPENAPI_REFRESH_STALE`: 캐시 stale refresh 사용 여부 (`0`/`1`)
- `OPENAPI_REFRESH_BUDGET_PER_RUN`: stale refresh 예산
- `OPENAPI_BATCH_MAX_MATCHES`: 배치 유저당 동기화 상한(기본 300)
- `OPENAPI_BATCH_WINDOW_MATCHES`: 분석 윈도우(기본 200, `all` 가능)
- `OPENAPI_BATCH_DELAY_MIN`, `OPENAPI_BATCH_DELAY_MAX`: 유저 간 지연(기본 0.8~1.6초)

주의: 시크릿(secrets)은 Git에 커밋하지 않습니다.

## 로컬 실행

1. 프론트 개발 서버

```bash
npm install
npm start
```

2. 백엔드 실행(운영형 통합 서빙)

```bash
python3 app.py
```

기본 실행 포트는 `80`이며, `app.py`가 `build/`와 `/data/*`를 함께 서빙합니다.

## 주요 CLI

Open API/주간 리포트 관련 수동 실행 명령:

```bash
python3 app.py openapi-selftest
python3 app.py openapi-sync-user --season <YYYY-N> --id <PLAYER_ID> [--max-matches 1200] [--refresh-ouid]
python3 app.py openapi-update-analysis --season <YYYY-N> --id <PLAYER_ID> [--max-matches 1200] [--window-matches N|all] [--refresh-ouid]
python3 app.py weekly-report [--week YYYY-Www] [--force]
python3 app.py weekly-backfill <START_WEEK> <END_WEEK> [--force]
```

## 스케줄러(앱 내부 APScheduler)

- `crawl_openapi_chain`: 2시간 간격 `:10` (짝수시)
  - 실행 순서: 전적 크롤링(`run_full_crawl`) -> OpenAPI 분석(`run_openapi_analytics_all`)
- `weekly_report`: 매주 목요일 `05:05`

락 파일:

- `.private/locks/daily_crawl.lock`
- `.private/locks/openapi.lock`

## NAS 배포(드래그&드롭 기준)

권장 절차:

1. 로컬에서 빌드

```bash
npm run build
```

2. 서버 배포 폴더(`/app` 기준)에 반영

- 코드/설정: `app.py`, `admin.html`, `admin-panel.js`, `fconline_openapi/`, `season_config.json`, `managers.json`
- 프론트 빌드: `build/index.html`, `build/static/*` 및 빌드 산출물
- 데이터: `data/`는 운영 데이터 유지(불필요한 덮어쓰기 금지)
- 환경변수: `.env`는 서버에서 직접 관리

3. 컨테이너/프로세스 재시작 후 확인

- `python3 app.py openapi-selftest`
- 웹 라우트(`/tables`, `/dashboard/:id`, `/dashboard/:id/squad`) 확인

## 트러블슈팅

- `NEXON_OPEN_API_KEY` 미로딩:
  - `python3 -c "import os; print(bool(os.environ.get('NEXON_OPEN_API_KEY')))"` 로 확인
  - 앱 외부 쉘에서 직접 실행 시 `.env` 자동 로딩 여부를 확인
- `OPENAPI00007`(429/잠시 후 재시도):
  - 점검/제한 상황일 수 있으므로 배치 지연/상한(`OPENAPI_BATCH_*`)을 낮춰 재시도
- `season_range` 누락 에러:
  - 최신 코드에서는 데이터 파일 기반 fallback으로 보완되며, 장기적으로 `season_config.json`에 시즌 범위를 명시하는 것을 권장
