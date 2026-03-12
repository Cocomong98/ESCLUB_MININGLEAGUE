### **프로젝트 요약 보고서**

#### **1. 프로젝트 개요 (Project Overview)**

- **프로젝트명:** Material Dashboard 2 React 기반의 FC 온라인 클럽원 데이터 시각화 대시보드
- **목표:** 특정 기간(시즌) 동안 FC 온라인 클럽원들의 게임 성적(순위, 승률, 판수 등)과 핵심 지표("채굴 효율")를 추적하고, 이를 시각적으로 분석할 수 있는 개인별 상세 대시보드 및 전체 순위표를 제공합니다.
- **사용자:** 클럽 관리자 또는 클럽원

#### **2. 핵심 기능 (Core Features)**

1.  **전체 순위표 (`/tables`)**

    - `current_crawl_display_data.json` 파일을 기반으로 모든 클럽원의 현재 시즌 주요 지표를 테이블 형태로 제공합니다.
    - 순위, 구단 가치, 채굴 효율, 승률, 성장력(전일 대비 채굴 효율 증감) 항목을 통해 전체적인 성과를 한눈에 비교할 수 있습니다.
    - 각 사용자를 클릭하면 개인 상세 대시보드로 이동합니다.

2.  **개인 상세 대시보드 (`/dashboard/:id`)**

    - 선택된 사용자의 상세 데이터를 시각화하여 보여줍니다.
    - **핵심 지표 카드:** 순위, 채굴파워, 승률, 판수 등 주요 지표의 최신 값과 전일 대비 변화량을 표시합니다.
    - **시계열 차트:** 최근 5일간의 순위, 일일 채굴량, 승률의 변동 추이를 라인/바 차트로 시각화하여 보여줍니다.
    - **시즌별 데이터 조회:** 드롭다운 메뉴를 통해 과거 시즌의 데이터를 선택하고 조회할 수 있습니다.

3.  **명예의 전당 (`/hall-of-fame`)**

    - 시즌별 `current_crawl_display_data.json`에서 상단 4개 왕 지표를 통합 조회합니다.
    - 각 시즌 카드에 `채굴왕`, `승률왕`, `판수왕`, `승부왕`을 2x2로 표시합니다.
    - 시즌/구단주 검색 및 시즌 정렬(최신/오래된 순)을 지원합니다.
    - 각 왕 항목에서 해당 구단주의 상세 대시보드로 이동할 수 있습니다.

4.  **개인 분석 확장 페이지 (`/dashboard/:id/squad`)**
    - Open API 분석 JSON(`last200`, `shot_events_last200`, `player_usage_last200`, `squad_analysis_all`) 기반의 스쿼드 분석 페이지를 제공합니다.
    - `/dashboard/:id/analysis` 라우트는 임시 비활성화 상태입니다.
    - 스쿼드 분석 페이지 상단에서 좌측 `베스트11 포지션 맵`과 우측 `지표 한눈에`(팀 세부 지표)를 함께 조회할 수 있습니다.
    - 스쿼드 분석의 선수명을 클릭하면 선수별 상세 페이지(`/dashboard/:id/squad/player/:playerKey`)로 이동해 출전/승률 등 표 데이터를 조회할 수 있습니다.

#### **3. 기술 스택 (Technology Stack)**

- **UI 프레임워크:** **React.js** (v18.2.0)
- **UI 라이브러리:** **Material-UI (MUI)** (v5.12.3) - 프로젝트의 전반적인 디자인 시스템과 `MDBox`, `MDButton` 등의 커스텀 컴포넌트의 기반이 됩니다.
- **라우팅:** **React Router** (v6.11.0) - `/tables`, `/dashboard/:id` 등 페이지 간의 이동을 관리합니다.
- **차트 라이브러리:** **Chart.js** (v4.3.0) with `react-chartjs-2` - 대시보드의 모든 차트를 렌더링합니다.
- **테이블 라이브러리:** **React Table** (v7.8.0) - 순위표의 데이터 테이블을 구현합니다.
- **개발 환경:** `react-scripts` (Create React App)

#### **4. 아키텍처 및 데이터 흐름 (Architecture & Data Flow)**

이 프로젝트는 **React 프론트엔드 + Flask 백엔드(`app.py`)** 구조입니다.
데이터 파일은 정적 JSON으로 관리되지만, 관리자 기능/크롤링/시즌 분할/히스토리 조회는 Flask API가 담당합니다.
관리자 페이지는 템플릿 `admin.html`과 외부 스크립트 `admin-panel.js`를 통해 동작합니다.

1.  **데이터 소스:**

    - 런타임 데이터 저장 루트는 `data/`이며, Flask가 `/data/*` 경로로 정적 서빙합니다 (`DATA_BASE_DIR="data"`).
    - **전체 사용자 데이터:** `data/{시즌}/current_crawl_display_data.json`
    - **개인별 일일 데이터:** `data/{시즌}/user/{ID}/{ID}_{날짜}.json`
    - **Open API 분석 데이터:** `data/{시즌}/user/{ID}/analysis/*.json`
    - **스쿼드 행 식별 키:** `squad_analysis_all.json`의 `rows[*].playerKey`(=`String(spId)`)를 기준으로 선수별 UI 상태를 연결합니다.

2.  **데이터 흐름:**
    - **`Tables` 페이지 로드:**
      1.  `/tables` 경로에 접속합니다.
      2.  `/data/{시즌}/current_crawl_display_data.json` 파일을 `fetch` API로 요청합니다.
      3.  가져온 데이터를 `React Table`을 이용해 순위표를 렌더링합니다.
    - **`Dashboard` 페이지 로드:**
      1.  순위표에서 특정 사용자를 클릭하면 `/dashboard/{사용자 ID}`로 이동합니다.
      2.  `Dashboard` 컴포넌트는 URL의 `id`를 가져옵니다.
      3.  최신 5일 치의 날짜를 기준으로, 해당 사용자의 일일 데이터 JSON 파일들을 병렬로 `fetch` 요청합니다 (`/data/{season}/user/{id}/{id}_YYMMDD.json`).
      4.  Open API 분석 섹션은 lazy-load로 `/data/{season}/user/{id}/analysis/{last200,shot_events_last200,player_usage_last200}.json`를 별도 요청합니다.
      5.  분석 JSON이 404이면 기존 대시보드는 그대로 유지되고, Open API 섹션만 `분석 데이터 준비 중` 상태를 표시합니다.

#### **5. 관리자 인증/보안 정책 (Admin Auth & Security)**

- **인증 방식:** 관리자 API는 세션 기반 인증(`POST /api/login`)으로 보호됩니다.
- **비밀번호 관리:** 운영 비밀번호는 코드 하드코딩이 아닌 환경변수 `ADMIN_PASSWORD`로 주입합니다.
- **세션 만료 정책:** `ADMIN_SESSION_TTL_MINUTES`(절대 만료), `ADMIN_SESSION_IDLE_MINUTES`(유휴 만료) 기준으로 자동 만료됩니다.
- **쿠키 정책:** `HttpOnly`, `SameSite=Strict` 쿠키를 사용합니다 (`SESSION_COOKIE_SECURE`는 운영 환경에서 `1` 권장).
- **요청 제한:** 로그인 요청에 IP 기반 간단 Rate Limit이 적용됩니다.
- **경로 보호:** 시즌명 형식 검증(`YYYY-N`) 및 catch-all 라우팅 제한으로 임의 파일 노출/경로 조작을 방지합니다.

#### **6. 주간 리포트 확정 정책 (Approved Weekly Policy)**

- **주간 범위(KST):** 목요일 `05:00:00` ~ 다음 목요일 `04:59:59`, 배치 실행 목표 시각은 목요일 `05:05`.
- **시즌 경계 처리:** 주간 구간이 시즌을 넘으면 시즌별 분할 집계 후 합산. 누적값 리셋(`종료 < 시작`)은 시즌 리셋으로 처리.
- **결측 처리:** 보간 없음(`imputation = none`), 경계점(시작/종료) 필요, 최소 유효일 기준 적용.
- **KPI 최소 표본:** 주간 왕 지표 후보는 **주간 판수 500판 이상**.
- **영향 범위:** 위 기준은 **주간 리포트 전용**이며, 기존 시즌별 왕 지표 로직은 변경하지 않음.

#### **7. Open API 분석 자동화 (운영 배치)**

- **배치 순서:** 일일 크롤링 잡(`daily_crawl`, `04:00`)과 Open API 분석 잡(`openapi_analytics`, `2시간 간격`)을 분리 운영
- **스케줄러:** Flask 내부 APScheduler 잡(`daily_crawl`, `openapi_analytics`, `weekly_report`)
- **락 파일:** `.private/locks/openapi.lock`, `.private/locks/daily_crawl.lock` (중복 실행 방지)
- **캐시 루트:** `OPENAPI_CACHE_DIR` 환경변수 또는 기본값 `.private/openapi_cache/` (TTL 정책: 29일, `/data/*` 비공개)
- **닉네임 해석 우선순위:** 관리자 목록(`managers.json`)의 `name`을 우선 사용하고, 없을 때만 최신 일일파일(`data/{season}/user/{id}/{id}_YYMMDD.json`)에서 fallback
- **시즌 범위 fallback:** `season_config.json`의 `season_ranges[season]`가 비어 있으면 `data/{season}/user/*/*_YYMMDD(_HHMM).json`(없으면 `manifest.endDate`)에서 범위를 추정해 분석을 지속
- **배치 부하 제어(환경변수):** `OPENAPI_BATCH_MAX_MATCHES`(기본 300), `OPENAPI_BATCH_WINDOW_MATCHES`(기본 200, `all` 허용), `OPENAPI_BATCH_DELAY_MIN/MAX`(기본 0.8~1.6초)
- **운영 CLI:**
  - `python app.py openapi-selftest`
  - `python app.py openapi-sync-user --season <YYYY-N> --id <PLAYER_ID>`
  - `python app.py openapi-update-analysis --season <YYYY-N> --id <PLAYER_ID>`

#### **8. 운영 배포 환경 (Deployment Context)**

- **호스팅 장비:** UGREEN NAS DXP2800 (개인 NAS)
- **실행 형태:** 단일 Flask 프로세스가 React 빌드 정적 파일 + `/data/*` JSON를 함께 서빙
- **스케줄 실행 주체:** 외부 스케줄러가 아닌 앱 내부 APScheduler
