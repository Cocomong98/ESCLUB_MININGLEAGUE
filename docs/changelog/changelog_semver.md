# SemVer Change Log (ESCLUB MINING LEAGUE)

이 문서는 `기존 HTML 기반 페이지`에서 `React 리뉴얼 프로젝트`로 전환된 이력을 기준으로, Git 커밋을 시멘틱 버전으로 재해석한 변경 이력입니다.

## 판정 기준

- `MAJOR`: 기존 소비자(데이터 경로, API 계약, 운영 흐름)가 그대로는 깨질 가능성이 큰 변경
- `MINOR`: 하위호환을 유지하면서 기능을 추가한 변경
- `PATCH`: 문서/정리/운영 보조 성격의 변경(기능 계약 변화 없음)

## Version History

## v1.x (Legacy, Git 이전)

- 상태: 참고용(저장소 커밋 이력 없음)
- 설명: HTML 기반 구버전 운영 단계

## v2.0.0 (2025-10-27)

- 커밋: `a7114d9` (`Initial commit`)
- 유형: `MAJOR`
- 핵심 변경:
  - React 대시보드 베이스라인 신규 도입 (`src/*`, `public/*`, `package.json` 등 대규모 초기 반영)
  - 기존 HTML 중심 운영에서 React 기반 구조로 전환

## v2.0.1 (2025-10-28)

- 커밋: `6622f8b` (`Readme 수정`)
- 유형: `PATCH`
- 핵심 변경:
  - 프로젝트 README를 서비스 문맥에 맞게 개편 (`README.md`)

## v2.0.2 (2025-10-28)

- 커밋: `9773fb2` (`파일 정리`)
- 유형: `PATCH`
- 핵심 변경:
  - 템플릿 잔여 파일 정리 (`ISSUE_TEMPLATE.md` 삭제)

## v3.0.0 (2026-02-19)

- 커밋: `dda5967` (`feat(frontend): add season-aware dashboard date flow and season query propagation`)
- 유형: `MAJOR`
- 핵심 변경:
  - 시즌 단위 데이터 경로로 프론트 데이터 계약 전환
    - `/data/current_crawl_display_data.json` -> `/data/<season>/current_crawl_display_data.json`
  - 대시보드 라우팅에 시즌 쿼리 전파
    - `/dashboard/:id?season=<season>`
  - 시즌 선택/판별 유틸 도입 (`src/utils/seasonUtils.js`)

## v3.1.0 (2026-02-19)

- 커밋: `01062ea` (`feat(admin): redesign admin panel and add season create/edit UX`)
- 유형: `MINOR`
- 핵심 변경:
  - 운영자 페이지 신규 추가 (`admin.html`)
  - 시즌 생성/수정 UI 및 멤버 관리/크롤링 실행 UX 추가

## v3.2.0 (2026-02-19)

- 커밋: `72d08a3` (`feat(server): implement season range validation and hour-based crawl routing`)
- 유형: `MINOR`
- 핵심 변경:
  - Flask 서버 로직 신규 도입 (`app.py`)
  - 시즌 범위 검증/중복 방지, 시즌 분할, 시간 단위 저장 정책 추가
  - 주요 API 추가:
    - `GET/POST /api/managers`
    - `POST /crawl-now`
    - `GET/POST /api/seasons`
    - `POST /api/seasons/split`
    - `PUT /api/seasons/<season>`
    - `GET /api/history/<season>/<player_id>`

## v3.2.1 (2026-02-19)

- 커밋: `ec00dd4` (`docs: add project state handoff guide for future sessions`)
- 유형: `PATCH`
- 핵심 변경:
  - 운영 인수인계 문서 추가 (`PROJECT_STATE.md`)

## v3.3.0 (Unreleased, Working Tree Candidate)

- 상태: 미출시(현재 워킹트리 기준 후보)
- 유형: `MINOR` 권장
- 핵심 변경:
  - 시즌 데이터 대규모 확장/분리
    - 신규: `public/data/2025-4/`, `public/data/2025-5/`, `public/data/2026-1/` (실파일 다수)
    - 삭제: 기존 루트 데이터 다수 (`public/data/user/*`, `public/data/current_crawl_display_data.json`)
  - 트래킹 스크립트 추가: `public/index.html` (Google Analytics)
- 주의:
  - 외부 소비자가 기존 루트 경로(`public/data/user/*`)를 직접 참조 중이면 `MAJOR` 재판정 필요

## 운영 메모

- 현재 `package.json`의 `version`은 템플릿 기본값 `2.2.0`입니다.
- 다음 릴리즈 시 실제 프로젝트 버전과 동기화 권장 (예: `3.3.0`).
