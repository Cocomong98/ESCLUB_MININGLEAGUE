# ESCLUB 운영 문서

기준일: 2026-08-01

## 1. 프로젝트 개요

FC Online 감독모드 클럽의 시즌별 순위, 누적 채굴량, 최근 경기, 스쿼드, 팀컬러, 경기 상세 정보를 제공한다.

현재 데이터 수집은 웹페이지 크롤링이 아니라 Nexon FC Online Open API를 사용한다. 웹페이지 URL이나 스쿼드 URL은 운영 데이터 수집에 사용하지 않는다.

## 2. 실행 구성

### 프론트엔드

- React + TypeScript
- TanStack Start / TanStack Router
- 빌드 결과: `.output/`
- 정적 데이터 제공 경로: `public/data/`

### 백엔드

- Flask
- 파일: `backend/app.py`
- 기본 포트: `80`
- 개발 실행:

```bash
npm run backend:dev
```

운영 컨테이너는 Flask 백엔드를 실행해야 한다. 프론트 정적 파일만 제공하면 예약 수집 스케줄러가 작동하지 않는다.

## 3. 데이터 수집 체인

운영 스케줄러는 `backend/app.py`가 실행될 때 등록된다.

```text
2시간마다 매시 10분
    ↓
전체 회원 목록 로드
    ↓
Nexon Open API OUID 조회
    ↓
회원별 매치 목록 수집
    ↓
시즌 종료 시각 기준으로 매치 분리
    ↓
승·무·패, 누적 채굴량, 최근 티어, 구단가치 계산
    ↓
사용자별 스냅샷 저장
    ↓
current_crawl_display_data.json 갱신
    ↓
전체 사용자 Open API 분석 배치
    ↓
스쿼드·경기 상세·팀컬러·선수 통계 파일 저장
```

예약 함수:

```python
run_daily_crawl_then_openapi()
```

스케줄:

```text
cron: hour="*/2", minute=10, timezone=Asia/Seoul
```

화면용 집계 파일은 예약 체인마다 갱신한다. 과거의 하루 1회 발행 제한은 제거되었다.

## 4. 수집 정보와 계산 규칙

### Nexon Open API 수집 정보

- 계정 OUID
- 매치 ID 목록
- 매치 종료 시각
- 양 팀 결과와 스코어
- 매치 당시 플레이어 티어 코드
- 양 팀 선수 및 선수 포지션
- 선수별 경기 통계
- 계정 프로필 및 최고 등급 메타데이터

### 내부 계산

- 시즌: 매치가 종료된 시각으로 분류
- 26-4 시즌 시작: 2026-07-30 12:00 KST
- 채굴량:
  - 슈퍼챔피언스 승리: 20 FC
  - 챔피언스 승리: 15 FC
  - 그 외 티어 또는 판정 불가 경기: 0 FC 또는 미확정 처리
- 현재 화면의 티어: 최근 매치의 플레이어 본인 티어
- 상대 티어: 채굴량 계산에 사용하지 않음
- 최근 5경기: `match_details_last20.json`의 최신 유효 경기 5건
- 테이블 순위 변동: 전일 순위 - 현재 순위
- 테이블 일일 채굴량: 전일 대비 누적 채굴량 증가분
- 하락한 채굴량: 0으로 보정하며 음수로 표시하지 않음

### 티어 뱃지

공식 메타 API가 최신 티어를 반환하면 API 값을 우선 사용한다. 현재 fallback은 다음과 같다.

```text
1700: 마스터1 / ico_rank6.png
1800: 마스터2 / ico_rank7.png
1900: 마스터3 / ico_rank8.png
2000: 월드클래스1 / ico_rank9.png
2100: 월드클래스2 / ico_rank10.png
2200: 월드클래스3 / ico_rank11.png
```

이미지 URL은 Nexon CDN을 사용한다.

## 5. 주요 파일 구조

```text
backend/app.py                         Flask 서버, API, 스케줄러
backend/fconline_openapi/client.py     Nexon Open API 클라이언트
backend/fconline_openapi/analytics.py  매치·스쿼드 분석
backend/fconline_openapi/cache.py      API 캐시 관리
backend/fconline_openapi/teamcolor_metadata.py
                                        팀컬러 메타데이터 로더
config/managers.json                   클럽원 명단
config/season_config.json              시즌 및 시즌 구간 설정
public/data/<season>/                  시즌별 화면·사용자 데이터
public/data/<season>/user/<id>/        사용자 스냅샷
public/data/<season>/user/<id>/analysis 분석 결과
data/meta/teamcolors/                  팀컬러 통합 메타데이터
.private/openapi_cache/                비공개 Open API 캐시
.private/run_logs/                     수집·분석 실행 로그
docs/                                  운영 및 유지보수 문서
```

## 6. 관리자 페이지 역할

관리자 페이지는 로그인 후 클럽원 명단을 관리한다.

- 회원 추가: 닉네임과 등록일 관리
- 회원 삭제
- `player_id`가 있으면 직접 사용하고, 없으면 닉네임 기반 Open API 조회
- 웹페이지 URL과 스쿼드 URL은 사용하지 않음
- 시즌 설정과 기타 관리 항목은 현재 UI에서 숨김 처리된 상태

회원 변경 후 다음 예약 수집부터 새 명단이 적용된다. 즉시 반영하려면 백엔드에서 수집 체인을 수동 실행한다.

## 7. 주요 페이지 역할

### `/`

시즌 선택 및 주요 순위 진입 화면.

### `/tables`

현재 시즌 전체 회원 순위 표.

- 순위
- 전일 대비 순위 변동
- 구단주
- 판수 및 승·무·패
- 누적 채굴량
- 일일 채굴량
- 승률
- 최근 매치 기반 구단가치
- 실제 최근 5경기 폼

### `/dashboard/:id`

개별 구단주 대시보드.

- 누적 채굴량
- 전일 대비 채굴량
- 순위·승률 추이
- 최근 5일 그래프
- 최근 20경기
- 최근 매치 티어 및 구단가치

### `/dashboard/:id/squad`

개별 구단주 스쿼드 분석.

- 최신 분석 스냅샷 기준 주전 11인
- 주 포메이션
- 급여 및 구단가치
- 팀컬러
- 선수 강화 단계
- 선수 상세 모달

### `/dashboard/:id/match/:matchKey`

개별 경기 상세.

- 양 팀 스쿼드
- 팀컬러
- 포메이션
- 경기 결과 및 팀 스탯
- MOM, 득점·도움 선수

### `/dashboard/:id/player/:playerId`

선수별 경기 통계 및 상세 정보.

### `/hall-of-fame`

시즌별 명예의 전당 및 누적 기록.

### `/admin`

관리자 인증 후 클럽원 명단 관리.

## 8. 데이터 유지보수

### 회원 명단

운영 기준 파일:

```text
config/managers.json
```

닉네임 변경이나 탈퇴가 있으면 관리자 페이지에서 수정한다. 파일을 직접 수정할 경우 JSON 배열 구조를 유지해야 한다.

### 시즌 설정

```text
public/season_config.json
```

`public/season_config.json`을 canonical 경로로 사용한다. 시즌 구간은 매치 종료 시각 기준으로 설정한다. 새 시즌을 추가할 때 시작일·시작시각과 종료일·종료시각을 함께 기록한다. `config/season_config.json`은 사용하지 않는다.

### 팀컬러 메타데이터

```text
data/meta/teamcolors/
```

현재 메타데이터는 XLSX와 CSV에서 생성된 JSON runtime 파일을 사용한다. 팀컬러 웹페이지 URL을 운영 중 조회하지 않는다.

## 9. Docker/NAS 배포

### 대상 장비

```text
장비: QNAP DXP-2800
CPU: Intel N100
용도: Docker 컨테이너 기반 운영
```

RAM 용량, 저장장치 종류·용량, Docker 네트워크 구성은 현재 프로젝트 정보에 포함되어 있지 않다. 배포 전 NAS에서 확인해야 한다.

### 필수 영속 볼륨

컨테이너 재생성 후에도 다음 경로는 유지되어야 한다.

```text
config/
public/data/
data/meta/
.private/openapi_cache/
.private/run_logs/
```

특히 `public/data`를 영속 볼륨으로 연결하지 않으면 수집 결과와 화면 데이터가 컨테이너 삭제 시 사라진다.

### 환경 변수

실제 키와 비밀번호는 이미지나 저장소에 포함하지 않는다.

필수:

```text
NEXON_OPEN_API_KEY
ADMIN_PASSWORD
FLASK_SECRET_KEY
```

운영에서는 `SESSION_COOKIE_SECURE=1`을 사용한다. HTTPS 없이 로컬에서 테스트할 때만 `0`으로 둔다.

### 현재 컨테이너 실행 구조

현재 배포 파일은 한 컨테이너 안에서 다음 세 프로세스를 실행한다.

```text
Nginx :80
  ├─ /api, /data → Flask :5001
  └─ 그 외 요청 → TanStack SSR :3000
```

- `backend/app.py`는 Flask와 Open API scheduler를 단일 인스턴스로 실행
- `.output/server/index.mjs`는 Node SSR로 실행
- Nginx가 외부 포트 `80`을 받아 두 내부 프로세스로 분배
- NAS 외부 공개 포트는 Docker 포트 매핑으로 지정
- Open API 키, 관리자 비밀번호, Flask secret은 환경 변수 또는 Docker secret으로 주입
- 컨테이너 시간대는 `Asia/Seoul` 권장

현재 배포 파일:

```text
Dockerfile
docker-compose.yaml
docker/nginx.conf
docker/supervisord.conf
```

## 10. 배포 전 점검표

- [ ] `config/managers.json` 회원 명단 확인
- [ ] `public/season_config.json` 현재 시즌 확인
- [ ] 26-4 시작 시각이 `2026-07-30 12:00 KST`인지 확인
- [ ] Nexon Open API 키 주입 확인
- [ ] 관리자 비밀번호 및 Flask secret 주입 확인
- [ ] `public/data` 영속 볼륨 연결
- [ ] `.private/openapi_cache` 영속 볼륨 연결
- [ ] 백엔드 scheduler 프로세스 실행 확인
- [ ] `npm run lint` 실행
- [ ] `npm run build` 실행
- [ ] `/tables` 시즌 순위 확인
- [ ] `/dashboard/<id>` 최근 5일 그래프와 최근 20경기 확인
- [ ] `/dashboard/<id>/squad` 주 포메이션과 선수 이미지 확인
- [ ] `/admin` 로그인 및 회원 추가·삭제 확인
- [ ] 수집 로그에서 `success`, `failed` 수 확인

## 11. 장애 대응

### 전체 화면 데이터가 갱신되지 않음

1. `.private/run_logs/` 최신 로그 확인
2. `current_crawl_display_data.json` 갱신 시각 확인
3. 컨테이너가 `backend/app.py`로 실행 중인지 확인
4. `DAILY_CRAWL_LOCK_FILE` 관련 잠금 프로세스 확인

### 특정 사용자만 데이터 없음

1. 해당 사용자의 OUID 조회 실패 여부 확인
2. 닉네임 변경 여부 확인
3. `public/data/<season>/user/<player_id>/` 파일 확인
4. Open API 분석 파일 생성 여부 확인

### API 호출 실패 증가

1. Nexon API 키 만료·제한 확인
2. `.private/run_logs/`에서 HTTP 오류와 OUID 오류 분리
3. 배치 지연값을 늘려 rate limit 여부 확인
4. 캐시 파일과 캐시 유지 경로 확인

### 마스터 티어 뱃지 미표시

1. 사용자 JSON의 `최근 매치 티어 코드` 확인
2. 코드가 `1700`, `1800`, `1900`인지 확인
3. `최근 매치 티어 이미지`가 `ico_rank6~8.png`인지 확인
4. 26-4 매치가 0건이면 티어가 표시되지 않는 것이 정상

## 12. 수동 실행

운영 체인 1회 실행:

```bash
cd /app/backend
../.venv/bin/python -u -c \
'import json; from app import run_daily_crawl_then_openapi; print(json.dumps(run_daily_crawl_then_openapi(), ensure_ascii=False, indent=2, default=str))'
```

백엔드 문법 점검:

```bash
npm run backend:check
```

프론트 검증:

```bash
npm run lint
npm run build
```
