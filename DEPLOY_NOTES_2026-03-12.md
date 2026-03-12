# 배포 주의사항 (패치 반영 후)

작성일: 2026-03-12 (KST)

## 이번 패치 범위

- OpenAPI 재시도/오류 메시지 개선 (`fconline_openapi/client.py`)
- OpenAPI 닉네임 후보 fallback 강화 (`fconline_openapi/sync.py`)
- 시즌 설정 파일 정합화 (`season_config.json`, `public/season_config.json`)
- UI 테마/가독성 보정 (다크모드 대비, 스쿼드 선수 모달/지표 카드)
- UI 상태 유지(localStorage `md2-ui-controller`) 및 사이드바 mini 로고 중앙 정렬 보정
- 문서 정합화 (`README.md`, `project_summary.md`, `PROJECT_STATE.md`)

## 배포 전 체크

1. 로컬 문법 점검
   - `python3 -m py_compile app.py fconline_openapi/*.py`
2. 프론트 빌드
   - `npm run build`
3. OpenAPI 동작 점검
   - `python3 app.py openapi-selftest`
   - `python3 app.py openapi-update-analysis --season 2026-1 --id 334024467 --max-matches 100 --window-matches 100 --refresh-ouid`

## 서버 업로드 시 교체 원칙

1. 교체 대상
   - `app.py`
   - `admin.html`, `admin-panel.js`
   - `fconline_openapi/`
   - `build/index.html` + `build/static/*` (둘 다 교체)
   - `asset-manifest.json` (권장)
   - `season_config.json`
   - `public/season_config.json` (동기화 사본)
2. 유지 대상
   - `data/` (운영 데이터 덮어쓰기 금지)
   - `.env` (서버에서 직접 관리)

## 중요 주의점

1. `season_config.json`은 루트 파일을 기준으로 운영한다.
2. 컨테이너 쉘에서 직접 Python 단발 실행 시 `.env` 로딩 여부를 반드시 확인한다.
3. OpenAPI 429(OPENAPI00007) 발생 시 빈도보다 `OPENAPI_BATCH_DELAY_*`와 `OPENAPI_BATCH_MAX_MATCHES`를 먼저 완화한다.
4. `/dashboard/:id/analysis` 라우트는 임시 비활성화 상태이므로 운영 확인은 `/dashboard/:id/squad` 기준으로 진행한다.
5. 관리자 세션 만료 정책(`ADMIN_SESSION_TTL_MINUTES`, `ADMIN_SESSION_IDLE_MINUTES`)을 운영 환경 `.env`에 설정한다.
6. 프론트만 배포할 때도 `index.html`과 `static`은 해시 참조 일치 관점에서 함께 교체한다.

## 배포 후 확인 체크리스트

1. 페이지 확인
   - `/tables`
   - `/dashboard/<id>`
   - `/dashboard/<id>/squad`
2. 로그 확인
   - `Request failed after retries: None` 메시지가 재발하는지 확인
   - `[OPENAPI] FAIL player_id=...`가 발생하면 에러 문구에 후보 닉네임이 노출되는지 확인
3. 스케줄 확인
   - `crawl_openapi_chain` (2시간 간격, 짝수시 `:10`, 전적 -> OpenAPI 순차 실행)
   - `weekly_report` (목 05:05)

## 롤백 기준

1. 5분 내 주요 라우트 3개 중 1개라도 정상 렌더링 실패 시 즉시 이전 배포본으로 롤백
2. OpenAPI 배치가 연속 실패하면 배치 빈도 변경보다 먼저 최근 패치 파일(`app.py`, `fconline_openapi/*`)만 이전본으로 복구
