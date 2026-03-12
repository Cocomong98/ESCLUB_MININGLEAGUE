# Nexon Open API 감독모드(52) 개인 세부 분석 설계

## 목표
- 기존 Flask + React 구조를 유지하면서 Nexon Open API 분석 기능을 안전하게 추가한다.
- 민감정보(API Key)는 `.env`로만 주입하고 산출물은 정적 JSON으로 저장한다.

## Phase 1: JSON 아티팩트 방식 (현 구조 최적)
- **선택 이유**:
  - 현재 프론트는 `/data/*` 정적 fetch 패턴을 이미 사용 중.
  - 실시간 DB/신규 백엔드 API 확장 없이 분석 기능을 붙일 수 있음.
  - 장애 시에도 기존 서비스(순위표/대시보드)는 독립적으로 동작.
- **산출물 위치**:
  - `data/{season}/user/{id}/analysis/*.json`
  - 예: `data/2026-1/user/1374062161/analysis/manager_mode_52_summary.json`
- **프론트 접근 방식**:
  - `/data/{season}/user/{id}/analysis/manager_mode_52_summary.json`를 기존 fetch 흐름으로 조회.

## 데이터 흐름
1. `nickname -> ouid` 조회 (Open API `/id`)
2. `ouid -> match ids` 조회 (감독모드 `matchtype=52`)
3. `match ids -> match detail` 수집 (캐시 우선, 누락분만 API 호출)
4. `match detail[] -> analytics` 계산
5. `analysis json` 생성/원자 저장
6. 대시보드에서 정적 fetch

## 캐시/재생성 정책 (30일 갱신 의무 대응)
- Nexon Open API 안내 기준으로, 크롤링 데이터는 30일 이내 갱신(또는 폐기) 정책을 준수해야 한다.
- **기본 모드 (기본값)**:
  - 매일 배치에서 29일 초과 raw 캐시를 즉시 삭제(purge).
  - 대상: match detail, user match index, ouid map 항목.
  - 결과: 29일 초과 cache payload가 디스크에 남지 않음.
- **선택 모드 (옵션)**:
  - `OPENAPI_REFRESH_STALE=1`일 때 stale 캐시를 예산 내에서 재수집(refresh).
  - 대상 후보: 25일 이상 경과한 match detail.
  - 예산: `OPENAPI_REFRESH_BUDGET_PER_RUN` (기본 200건/실행).
- **배치 순서**:
  1. purge 수행(항상)
  2. refresh 수행(옵션 모드일 때만)
  3. 유저 분석 갱신 실행

## 로컬 캐시 저장소 구조
- 루트(비공개): `OPENAPI_CACHE_DIR` 또는 기본 `./.private/openapi_cache/`
- `ouid_map.json`:
  - `{ "<nickname>": { "ouid": "<ouid>", "fetchedAt": "<KST ISO>" } }`
- `user/<ouid>/match_index_<matchtype>.json`:
  - `{ "fetchedAt": "<KST ISO>", "payload": ["matchId1", "matchId2", ...] }`
- `match/<matchId>.json.gz`:
  - `{ "fetchedAt": "<KST ISO>", "payload": { ...match-detail... } }`
- `meta/<name>.json`:
  - `{ "fetchedAt": "<KST ISO>", "payload": <meta payload> }`

## TTL=29일 명시
- Open API 데이터 갱신 의무(30일) 대응을 위해 캐시 TTL을 29일로 고정한다.
- 목적은 만료 전 선제 재수집이며, 스케줄 지연/재시도 상황에서도 30일 제한 초과를 방지하기 위함이다.

## Open API Selftest (로컬 진단)
- 목적: 배포 전 `API 키 유효성 + 네트워크 호출 가능 여부`를 빠르게 점검.
- 커맨드:
  - `python app.py openapi-selftest`
- 동작:
  1. `NEXON_OPEN_API_KEY` 로드
  2. `/static/fconline/meta/matchtype.json` 호출
  3. `matchtype=52` 포함 여부 검사
  4. 성공 시 `OK` 출력 + 종료코드 0, 실패 시 `FAIL` + 종료코드 1
- 키가 없을 때:
  - `NEXON_OPEN_API_KEY is not set` 메시지와 함께 비정상 종료

## 유저 단위 증분 동기화 CLI
- 커맨드:
  - `python app.py openapi-sync-user --season 2025-5 --id 123 --max-matches 1200`
  - OUID 캐시를 무시하고 강제 재조회할 때:
    - `python app.py openapi-sync-user --season 2025-5 --id 123 --refresh-ouid`
- 동작:
  - `data/{season}/user/{id}/{id}_YYMMDD.json` 최신 파일에서 `구단주명` 추출
  - `nickname -> ouid` 조회(캐시 우선)
  - `ouid + matchtype=52` 기준으로 matchId 페이지 조회
  - 기존 index에 이미 있는 matchId를 만나면 즉시 중단(증분 동기화)
  - 신규 matchId만 `match-detail` 조회 후 `OPENAPI_CACHE_DIR/match/<matchId>.json.gz` 저장

## 세부 분석 산출 CLI
- 커맨드:
  - `python app.py openapi-update-analysis --season 2025-5 --id 123`
  - 옵션:
    - `--max-matches 1200` (sync 단계 수집 상한)
    - `--window-matches N|all` (분석 윈도우 크기, 기본값은 `all`)
    - `--refresh-ouid` (OUID 캐시 무시)
- 동작:
  - `openapi-sync-user` 수행 후 바로 세부 분석 JSON 생성
  - 산출 파일:
    - `data/{season}/user/{id}/analysis/last200.json`
    - `data/{season}/user/{id}/analysis/shot_events_last200.json`
    - `data/{season}/user/{id}/analysis/player_usage_last200.json`

## 세부 분석 규칙
- `ShootDetailDTO.goalTime`는 2^24 구간 보정식을 적용해 초 단위(`tSec`)로 변환한다.
- 샷 좌표 `x`,`y`는 0~1 범위를 벗어나면 클램프(0 또는 1) 처리한다.
- `matchDate`(UTC0 문자열)는 KST로 변환한 `dateKst` 기준으로 집계/표시한다.

## 디렉토리/모듈 책임
- `fconline_openapi/client.py`: Nexon Open API HTTP 클라이언트
- `fconline_openapi/cache.py`: 파일 기반 TTL 캐시
- `fconline_openapi/sync.py`: 수집/캐시/분석/저장 오케스트레이션
- `fconline_openapi/analytics.py`: 감독모드 분석 계산
- `fconline_openapi/season_range.py`: 시즌 범위 보조 유틸

## 운영 보안 원칙
- API Key는 `.env`로만 관리 (`NEXON_OPEN_API_KEY`)
- `.env` 및 런타임 데이터(`data/*`, `public/data/*`)는 git 추적 금지
- 산출물 JSON에는 키/토큰/개인식별 민감정보 직접 저장 금지

## TODO (후속 프롬프트 반영)
- 명예의 전당/라우팅 최신 동작 설명과 문서 불일치 구간 정리.
