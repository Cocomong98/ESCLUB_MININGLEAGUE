# Fullstack Audit Report

## 평가 메타데이터

```text
mode: full
recommended_model: GPT-5.6 Sol
actual_model: GPT-5.6 Sol 요청값 사용; 런타임 모델 식별자는 별도 미노출
commit: 5b14303b12fb934e59f033ca950c1b9d1a8cb7ec
branch: v4/main
evaluated_at: 2026-08-02T01:04:20+09:00
timezone: Asia/Seoul
initial_worktree: clean
source_or_config_changes: none
```

실행 환경:

- macOS 26.5.2, Darwin 25.5.0, arm64
- Node.js v23.7.0, npm 11.18.0
- Python 3.14.5, 프로젝트 `.venv`
- Docker CLI 29.4.0, Compose v5.1.2
- Docker daemon 미실행. `docker compose config`는 통과했고 `docker build --check .`는 daemon 연결 실패로 미검증.
- 초기 커밋 제목: `docs(audit): add reusable project evaluation skill`

평가 기준: `docs/evaluation/RUBRIC.md`, `docs/evaluation/TEST_SCENARIOS.md`, `docs/PROJECT_OPERATIONS.md`.

## 결론

출시 차단 수준의 단일 장애는 확인하지 않았으나 현재 상태는 배포 승인 불가다. 현재 시즌 데이터의 의미를 왜곡하는 프론트엔드 결함, 선수 결과 분류 오류, 관리자 로그인 방어 우회, Docker 캐시 영속화 불일치가 동시에 존재한다.

| 영역 | 점수 / 5 | 판정 |
|---|---:|---|
| 기획·기능 | 2 | 주요 흐름에 문제 |
| 디자인·UX | 3 | 기능은 작동하지만 명확한 결함 존재 |
| 프론트엔드 개발 | 3 | 빌드는 통과하나 데이터 의미 오류 존재 |
| Flask 백엔드 | 3 | 주요 API는 작동하나 인증 방어와 운영 서버 결함 존재 |
| Nexon Open API 데이터 | 2 | 시즌 분리는 확인됐으나 화면 집계·표시 불일치 존재 |
| 보안 | 2 | 로그인 제한 우회와 약한 운영 비밀번호 확인 |
| Docker 배포 | 2 | 캐시 영속화 경로 불일치와 개발 서버 사용 |
| QA | 3 | 수동 시나리오는 대부분 작동하나 자동 테스트 부재 |

종합: 20/40, 2.5/5.

심각도 집계: High 8, Medium 5, Low 1.

## Findings

### F-001 실제 경기 데이터가 없을 때 최근 5경기를 합성한다

- 심각도: High
- 영역: 기획·데이터·프론트엔드
- 파일·심벌: `src/lib/service-data.ts:603` `normalizeServiceRows`, `src/lib/service-data.ts:667` `enrichRowsWithRecentMatchData`, `src/lib/service-data.ts:886` `synthesizeForm`
- 영향: `match_details_last20.json`에 경기가 0건이어도 W/W/W/L/W 또는 다른 고정 패턴을 실제 최근 5경기처럼 표시한다. 데이터 없는 회원의 폼이 조작된 경기 기록으로 보인다.
- 재현 절차: `/tables`에서 `ES린이대디` 행 확인 → `/dashboard/551649643` 이동 → 실제 최근 경기 파일의 `rows`는 0건인데 두 화면 모두 W/W/W/L/W 표시.
- 근거: `synthesizeForm`은 시즌 총 승·무·패만으로 고정 5개 패턴을 생성한다. 브라우저에서 `ES린이대디`의 판수 0, 최근 경기 분석 없음, W/W/W/L/W가 동시에 재현됐다.
- 수정 방향: 기본 `form`을 빈 배열로 두고 실제 `match_details_last20.json`의 유효 최신 5건만 표시한다. 누락·0건은 명시적 빈 상태로 처리한다.
- 검증 방법: 최근 경기 0건, 1~4건, 5건 이상 fixture로 폼 길이와 순서가 원본과 일치하는지 단위·브라우저 테스트한다.
- 확신도: 매우 높음

### F-002 선수 상세가 승패를 홈·원정으로 오분류한다

- 심각도: High
- 영역: 프론트엔드·데이터
- 파일·심벌: `src/routes/dashboard.$id.player.$playerId.tsx:314` `resolvePlayerDetail`, `:463` `resultLabel`
- 영향: 승리는 `홈`, 무승부·패배는 모두 `원정`으로 변환된다. 최근 경기 표의 `결과` 열과 홈/원정 평균 평점이 모두 잘못된다.
- 재현 절차: `/dashboard/1374062161/player/866237238` 접근 → 최근 경기 표의 결과 열이 `홈` 또는 `원정`만 표시되는지 확인.
- 근거: `resultLabel(result)`가 `result === "승" ? "홈" : "원정"`을 반환한다. 브라우저에서 결과 열에 홈/원정이 표시됐다.
- 수정 방향: 결과는 승/무/패로 유지한다. 홈·원정 데이터가 필요하면 Open API의 양측 위치를 별도 필드로 생성해 독립적으로 계산한다.
- 검증 방법: 승·무·패와 홈·원정의 직교 fixture 6개로 결과 열과 양쪽 평균 평점을 검증한다.
- 확신도: 매우 높음

### F-003 현재 시즌 순위 화면의 기록왕이 이전 시즌 값으로 계산된다

- 심각도: High
- 영역: 기획·백엔드·데이터·프론트엔드
- 파일·심벌: `backend/app.py:1543` `run_full_crawl`의 king 집계, `src/routes/tables.tsx:246` `KingStrip`
- 영향: 현재 시즌 표와 상단 기록왕 카드가 서로 다른 시즌을 표현한다. `/tables` 현재 1위 누적은 945인데 채굴왕은 이전 시즌 값 9,360으로 표시된다.
- 재현 절차: `/tables`에서 현재 표의 누적 최댓값과 상단 채굴왕 값 비교. 승률왕과 판수왕도 같은 방식으로 비교.
- 근거: 백엔드는 `지난 시즌 누적채굴량`, `지난 시즌 승률`, `지난 시즌 판수`로 king을 선택한다. `KingStrip`도 해당 이전 시즌 필드를 우선 표시한다. 저장 JSON은 멍웅찬 current 270/previous 9360, ES메가꿀아 current 38.5%/previous 55.6%, ES누고 current 242/previous 1200이다.
- 수정 방향: 현재 시즌 페이지용 king은 `누적채굴량`, `승률`, `판수`, `무`로 계산한다. 이전 시즌 기록은 별도 명시된 섹션이나 명예의 전당으로 분리한다.
- 검증 방법: 현재/이전 시즌 값이 의도적으로 다른 fixture로 카드와 표의 최댓값이 일치하는지 검증한다.
- 확신도: 매우 높음

### F-004 빈 승부왕 sentinel이 깨진 대시보드 링크를 만든다

- 심각도: Medium
- 영역: 기획·UX·라우팅
- 파일·심벌: `backend/app.py:1544` 빈 레코드, `:1548` `heavy`/`draw_king`, `src/routes/tables.tsx:246` `KingStrip`, `src/routes/hall-of-fame.tsx:292` `buildRemoteHall`
- 영향: 대상이 없는데 `승부왕 - 0` 카드가 노출되고 `/dashboard/` 또는 `/dashboard/-`로 연결된다. TanStack Router 경고가 반복된다.
- 재현 절차: `/tables`와 `/hall-of-fame`에서 승부왕 클릭 대상 URL 확인. 개발 콘솔 확인.
- 근거: 4,000경기 이상만 필터링한 뒤 빈 객체 sentinel을 반환한다. 브라우저 DOM에 `/dashboard/`와 `/dashboard/-`가 확인됐고 전체 검사 세션에서 잘못 생성된 경로 경고가 6회 기록됐다.
- 수정 방향: 대상이 없으면 `null`을 반환하고 카드를 렌더링하지 않거나 명시적 `집계 대상 없음` 비링크 상태를 표시한다. 4,000경기 기준의 도메인 타당성도 재정의한다.
- 검증 방법: 대상 0명/1명/다수 fixture에서 링크 유효성과 콘솔 경고 0건을 확인한다.
- 확신도: 매우 높음

### F-005 Open API 캐시 기본 경로와 Docker 영속 볼륨이 다르다

- 심각도: High
- 영역: Flask 백엔드·Nexon 데이터·Docker 운영
- 파일·심벌: `backend/fconline_openapi/cache.py:20` `REPO_ROOT`, `:21` `DEFAULT_OPENAPI_CACHE_DIR`, `docker-compose.yaml:18`
- 영향: 기본 환경에서 분석 캐시는 `/app/backend/.private/openapi_cache`에 쓰이지만 Compose는 `/app/.private/openapi_cache`만 유지한다. 컨테이너 재생성 시 OUID, 매치 인덱스, 상세 캐시가 유실되어 전량 재호출·분석 공백·API 제한 위험이 발생한다.
- 재현 절차: `OPENAPI_CACHE_DIR` 미설정 상태에서 `get_cache_root()` 경로 확인 → `docker compose config`의 mount target과 비교.
- 근거: 로컬 실제 캐시는 `backend/.private/openapi_cache`에 38,779개 파일, 159MB가 존재하고 루트 `.private/openapi_cache`는 없다. Compose target은 `/app/.private/openapi_cache`다.
- 수정 방향: 기본 캐시 루트를 프로젝트 루트 `.private/openapi_cache`로 통일하거나 Compose에 `OPENAPI_CACHE_DIR=/app/.private/openapi_cache`를 명시한다. 기존 캐시 마이그레이션을 원자적으로 수행한다.
- 검증 방법: 컨테이너에서 실제 `get_cache_root()` 출력과 mount target 일치 확인 → 캐시 생성 → 컨테이너 재생성 → 파일 수와 cache hit 유지 확인.
- 확신도: 매우 높음

### F-006 백엔드 내부 캐시가 Docker 이미지 빌드 컨텍스트에 포함될 수 있다

- 심각도: High
- 영역: 보안·Docker
- 파일·심벌: `.dockerignore:9`, `Dockerfile:8` `COPY . .`, `backend/fconline_openapi/cache.py:21`
- 영향: `.dockerignore`는 루트 `.private/openapi_cache`만 제외하지만 실제 캐시는 `backend/.private/openapi_cache`에 있다. 159MB의 OUID·매치 상세 캐시가 build stage와 최종 이미지에 복사될 수 있어 이미지 비대화와 개인정보성 식별자 배포 위험이 있다.
- 재현 절차: 실제 캐시 경로와 `.dockerignore` 패턴 비교 → Docker build context 또는 최종 이미지의 `/app/backend/.private/openapi_cache` 확인.
- 근거: `COPY . .` 뒤 build stage 전체를 최종 이미지로 복사한다. 실제 nested cache 38,779개가 존재한다. Docker daemon 부재로 최종 이미지 내부 확인은 수행하지 못했다.
- 수정 방향: `**/.private/**`, `backend/.private/**`를 build context에서 제외하고 런타임 mount 경로만 생성한다. 빌드 전 비밀·캐시 포함 검사를 CI에 추가한다.
- 검증 방법: `docker build` 후 `docker run --rm image find /app -path '*/.private/*'`가 빈 결과인지 확인하고 이미지 크기를 비교한다.
- 확신도: 높음

### F-007 로그인 레이트리밋이 위조 가능한 X-Forwarded-For를 신뢰한다

- 심각도: High
- 영역: Flask 백엔드·보안·Nginx
- 파일·심벌: `backend/app.py:280` `get_client_ip`, `:1787` `api_login`, `docker/nginx.conf:13`
- 영향: 공격자가 요청마다 첫 번째 `X-Forwarded-For` 값을 바꾸면 5분당 10회 로그인 제한을 우회해 무제한 비밀번호 대입을 수행할 수 있다.
- 재현 절차: 동일 XFF로 잘못된 비밀번호 11회 전송 시 11번째 429 확인 → 매 요청 XFF를 바꾸어 11회 전송 시 모두 401 확인.
- 근거: 로컬 재현 결과 동일 IP `401×10, 429×1`; 변경 IP `401×11`. Nginx의 `$proxy_add_x_forwarded_for`는 기존 클라이언트 헤더 뒤에 실제 주소를 추가하고 백엔드는 첫 항목을 사용한다.
- 수정 방향: 외부에서 들어온 XFF를 Nginx에서 폐기하고 `$remote_addr`만 전달하거나 Flask `ProxyFix`를 신뢰 프록시 홉 수 1로 제한한다. 인메모리 대신 프로세스 간 공유되는 제한 저장소를 사용한다.
- 검증 방법: 임의 XFF를 보낸 동일 원격 IP가 11번째에 429인지 Nginx 경유 통합 테스트한다.
- 확신도: 매우 높음

### F-008 현재 실행 환경의 관리자 비밀번호 강도가 부족하다

- 심각도: High
- 영역: 보안·운영 환경
- 파일·심벌: `.env`의 `ADMIN_PASSWORD` 값, `backend/app.py:343` `verify_admin_password`
- 영향: 현재 비밀번호는 6자리 숫자형이다. F-007과 결합하면 관리자 회원 목록 변조 가능성이 높아진다.
- 재현 절차: 비밀값을 출력하지 않고 `.env`의 비밀번호 길이와 문자군을 검사한다.
- 근거: 길이 6, 숫자 문자군만 사용. `.env`는 Git과 Docker build context에서 제외되어 저장소 유출은 확인되지 않았다.
- 수정 방향: 20자 이상 무작위 비밀번호 또는 외부 인증을 사용하고 기존 비밀번호를 교체한다. 시작 시 최소 강도 미달이면 프로세스를 실패시키는 검증을 추가한다.
- 검증 방법: 약한 값으로 기동 실패, 강한 값으로 로그인 성공, 비밀값이 Git·이미지·로그에 존재하지 않는지 검사한다.
- 확신도: 매우 높음

### F-009 Docker 운영 백엔드가 Werkzeug 개발 서버를 사용한다

- 심각도: High
- 영역: Flask 백엔드·Docker 배포
- 파일·심벌: `docker/supervisord.conf:7`, `backend/app.py:2273` `app.run`, `backend/requirements.txt`
- 영향: 운영 컨테이너가 프로덕션 WSGI 서버 없이 Flask 개발 서버를 직접 실행한다. 요청 처리 안정성, graceful shutdown, timeout, 자원 제한, 장애 격리가 취약하다.
- 재현 절차: Supervisord backend command 확인 → 컨테이너 또는 동일 명령 기동 시 Werkzeug 개발 서버 경고 확인.
- 근거: 로컬 동일 앱 기동 시 `WARNING: This is a development server. Do not use it in a production deployment.` 출력. requirements에 Gunicorn/Waitress가 없다.
- 수정 방향: 단일 scheduler 소유권을 보장하면서 Gunicorn 1 worker + 적정 threads를 사용하거나 scheduler를 별도 프로세스로 분리한다. timeout·graceful shutdown·healthcheck를 정의한다.
- 검증 방법: 컨테이너 프로세스 목록에서 WSGI 서버 확인, SIGTERM graceful 종료, 동시 요청, scheduler 단일 실행, 재시작 테스트 수행.
- 확신도: 매우 높음

### F-010 명예의 전당이 과거 시즌과 통산 기록을 제공하지 않는다

- 심각도: Medium
- 영역: 기획·기능·프론트엔드
- 파일·심벌: `src/routes/hall-of-fame.tsx:34` `HallOfFamePage`, `:48` `buildRemoteHall` 전환, `:292` `buildRemoteHall`
- 영향: 페이지 메타와 운영 문서는 역대 시즌·누적 기록을 약속하지만 원격 현재 시즌 데이터가 있으면 정적 과거 기록 전체를 대체한다. 시즌 설정 8개 중 화면은 `SEASONS: 1`만 표시한다.
- 재현 절차: `/hall-of-fame` 접근 → `2026-4` 한 시즌과 현재 랭킹만 표시되는지 확인.
- 근거: `remote`가 존재하면 `CHAMPIONS`와 `CAREER_RECORDS` 대신 현재 시즌 1개로 교체한다. 브라우저에서 1 SEASONS가 재현됐다.
- 수정 방향: 종료 시즌별 최종 snapshot을 로드해 과거 기록을 유지하고 현재 시즌 카드를 추가한다. 통산 집계는 모든 확정 시즌을 누적한다.
- 검증 방법: 최소 3개 시즌 fixture에서 시즌 카드 수, 우승·준우승, 통산 합계, 현재 시즌 미확정 표시를 검증한다.
- 확신도: 매우 높음

### F-011 빈 분석 파일을 정상 상태와 전술 데이터로 표현한다

- 심각도: Medium
- 영역: UX·데이터 상태
- 파일·심벌: `src/lib/service-data.ts:542` `fetchSquadBundle`, `src/routes/dashboard.$id.squad.tsx:274` `resolveSquad`, `:304` `resolveManagerMode`
- 영향: JSON 파일 6개가 존재하기만 하면 `ready`가 된다. 내부 경기·선수 배열이 0건이어도 `상태: 정상`, `수비형`, `0경기`, `선수 분석 파일 없음`이 동시에 표시되어 빈 데이터와 정상 데이터를 구분하지 못한다.
- 재현 절차: `/dashboard/551649643`과 `/dashboard/551649643/squad` 접근. 해당 사용자의 `match_details_last20.rows`와 `squad_analysis_all.rows`는 0건.
- 근거: ready 판정은 payload 존재 여부만 계산한다. 브라우저에서 `상태: 정상`과 분석 파일 없음이 동시에 재현됐다.
- 수정 방향: `ready/empty/partial/error`를 schema 수준에서 판정한다. 0건에서는 전술 스타일·평균 KPI를 추론하지 말고 `이번 시즌 유효 경기 없음`을 표시한다.
- 검증 방법: 파일 없음, 잘못된 JSON, 정상 빈 배열, 일부 데이터, 완전 데이터 fixture별 상태와 문구를 검사한다.
- 확신도: 매우 높음

### F-012 모바일 스쿼드 페이지가 390px 뷰포트를 넘는다

- 심각도: Medium
- 영역: 디자인·UX·반응형
- 파일·심벌: `src/routes/dashboard.$id.squad.tsx:132` 메인 grid와 두 번째 child
- 영향: 390px 뷰포트에서 문서 폭이 440px가 되어 전체 페이지가 수평 스크롤된다. 표 내부의 의도된 가로 스크롤과 달리 페이지 자체가 밀린다.
- 재현 절차: 390×844에서 `/dashboard/551649643/squad` 접근 → `document.documentElement.scrollWidth` 비교.
- 근거: `innerWidth=390`, `scrollWidth=440`; 주요 child의 right edge 440. 다른 주요 페이지의 document width는 390이었다.
- 수정 방향: grid 자식 전체에 `min-w-0`을 적용하고 긴 콘텐츠는 내부 `overflow-x-auto`에 가둔다. 320/360/390/430px에서 검증한다.
- 검증 방법: 각 모바일 폭에서 document scrollWidth와 innerWidth가 같고 선수 표만 내부 스크롤되는지 확인한다.
- 확신도: 매우 높음

### F-013 자동화된 기능 테스트가 없다

- 심각도: Medium
- 영역: 개발·QA
- 파일·심벌: `package.json:scripts`, 프로젝트 전체 테스트 구조
- 영향: 시즌 경계, 채굴량, 순위, 폼, 선수 결과, 관리자 인증, Docker routing의 회귀가 lint/build로 검출되지 않는다. F-001과 F-002가 빌드 통과 상태로 존재한다.
- 재현 절차: `package.json` scripts와 저장소 테스트 파일 확인.
- 근거: test 스크립트와 프론트·백엔드 테스트 suite가 없다.
- 수정 방향: 데이터 변환 단위 테스트, Flask API 테스트, Playwright 핵심 흐름, Docker smoke test를 추가한다.
- 검증 방법: CI에서 lint/build/backend-check/unit/integration/e2e가 모두 실행되고 의도적 회귀 fixture가 실패하는지 확인한다.
- 확신도: 높음

### F-014 문서의 시즌 설정 운영 경로가 실제 구현과 다르다

- 심각도: Low
- 영역: 기획·운영 문서
- 파일·심벌: `docs/PROJECT_OPERATIONS.md` 시즌 설정 섹션, `backend/app.py:101` `SEASON_CONFIG_FILE`
- 영향: 문서는 `config/season_config.json`과 `public/season_config.json`을 함께 유지하라고 하지만 현재 저장소에는 public 파일만 존재하고 구현도 public 파일을 우선 사용한다. 운영자가 잘못된 파일을 수정할 수 있다.
- 재현 절차: 두 경로 존재 여부와 `resolve_existing_repo_file` 우선순위 비교.
- 근거: `config/season_config.json` 없음, `public/season_config.json` 존재.
- 수정 방향: 단일 canonical 경로를 정하고 문서·관리자 API·볼륨 정책을 일치시킨다.
- 검증 방법: 새 시즌 저장 후 canonical 파일 하나만 변경되고 프론트와 scheduler가 동일 값을 읽는지 확인한다.
- 확신도: 매우 높음

## 자동 검사 결과

| 검사 | 결과 | 세부 |
|---|---|---|
| `npm run lint` | 통과 | 오류 0, Fast Refresh 경고 7 |
| `npm run build` | 통과 | client/SSR/Nitro production build 성공 |
| `npm run backend:check` | 통과 | `backend/app.py`, `backend/fconline_openapi/*.py` py_compile 성공 |
| `docker compose config` | 통과 | Nginx 80, Flask 5001, Node SSR 3000, bind mount 해석 성공 |
| `docker build --check .` | 미검증 | Docker daemon 미실행 |

린트 경고 파일: `src/components/ui/badge.tsx`, `button.tsx`, `form.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `toggle.tsx`, `src/lib/season-context.tsx`. 심각도 Low. Fast Refresh 개발 경험에만 영향하며 프로덕션 빌드는 통과했다.

## 브라우저 시나리오 결과

검사 뷰포트: PC 1440×900, 모바일 390×844. 다크·라이트 모두 확인.

| 시나리오 | 결과 |
|---|---|
| `/tables` 시즌 순위 | 렌더링 성공, 34행, PC/모바일 레이아웃 정상. F-001/F-003/F-004 존재 |
| `/dashboard/551649643` | 직접 접근 성공. 빈 분석 상태 의미 오류와 합성 폼 존재 |
| `/dashboard/551649643/squad` | 직접 접근 성공. 데이터 0건, 모바일 전체 페이지 overflow 존재 |
| `/dashboard/1374062161/match/b371ae2351d4` | 양측 11인, 팀컬러, 포메이션, 평점, 득점, 팀 스탯 렌더링 성공 |
| 경기 상세 새로고침 | 성공, 직접 URL 유지, 양측 스쿼드 유지 |
| `/dashboard/1374062161/player/866237238` | 선수·강화 관련 상세와 최근 10경기 렌더링 성공. F-002 존재 |
| `/hall-of-fame` | 렌더링 성공. 과거 시즌·통산 기능 누락 |
| `/admin` | 잠금 화면 렌더링 성공. 비인증 `/api/managers` 401 |
| 다크·라이트 | PC·모바일 전환 성공, theme class와 배경·전경 변경 확인 |
| 깨진 이미지 | 검사 시점 주요 페이지 0건 |
| 콘솔 | error 0, F-004 관련 route warning 6건 |

## 데이터·백엔드 확인 결과

- Nexon 데이터 호출 구현은 `https://open.api.nexon.com`과 Nexon CDN을 사용한다. 운영 수집에서 웹페이지 크롤링 경로는 확인되지 않았다.
- 채굴 정책은 본인 `division`과 승리 결과를 사용하며 800=20 FC, 900=15 FC로 구현돼 있다.
- `2026-4` 현재 집계 34명: `판수 = 승+무+패` 불일치 0건, 음수 일일 채굴량 0건, tier 없는 ranked row 0건.
- 공개 match detail 검사 범위: `2026-3` 560건, 2026-07-26 12:03:11~2026-07-30 03:59:51 KST; `2026-4` 540건, 2026-07-30 18:52:40~2026-08-01 14:59:39 KST. 확인된 데이터는 설정된 시즌 경계를 넘지 않았다.
- 공개 분석 JSON은 `matchId: hashed`, `ouid: omitted` 정책을 선언하며 검사한 파일에서 원시 OUID 노출은 확인되지 않았다.
- Flask session은 HttpOnly, SameSite=Strict, 환경 기준 Secure를 사용한다. 비인증 관리자 데이터 API는 401을 반환한다.
- 보안 헤더 `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP가 Flask 응답에 존재한다.

## 제한 및 검증 필요

- 실제 NAS, 외부 HTTPS reverse proxy, 공개 도메인, 방화벽, Docker 네트워크는 접근 정보가 없어 검증하지 않았다.
- Docker daemon이 없어 이미지 빌드, 프로세스 기동, health/restart, 실제 볼륨 재생성 테스트를 수행하지 못했다.
- 실제 Nexon Open API 호출은 데이터와 rate limit을 변경할 수 있어 실행하지 않았다. 기존 캐시·공개 산출물·run log를 읽기 전용으로 검사했다.
- 관리자 로그인 후 회원 추가·삭제는 설정 변경을 유발하므로 실행하지 않았다. 인증 경계와 비인증 응답만 검사했다.
- `.env` 비밀값은 보고서에 기록하지 않았다.

## 우선순위

1. F-001, F-002, F-003 데이터 의미 오류 수정.
2. F-007, F-008 관리자 인증 방어 강화와 비밀번호 교체.
3. F-005, F-006 Docker 캐시 경로·build context 정리.
4. F-009 운영 WSGI 전환.
5. F-004, F-010, F-011, F-012 기능·UX 정리.
6. F-013 회귀 테스트 추가.
