# Configuration Catalog

작성일: 2026-03-13 (KST)

## 목적

- 설정 파일/환경변수의 역할과 수정 주체를 한 번에 확인하기 위한 참조 문서.

## 파일 기반 설정

1. `config/season_config.json`
   - 시즌 범위/현재 시즌/스케줄 기준
   - 수정 주체: 관리자/운영자
2. `config/managers.json`
   - 구단주(대상 사용자) 목록
   - 수정 주체: 관리자
3. `.env` (서버 전용)
   - 시크릿/배치 파라미터
   - 수정 주체: 운영자
4. `.env.example` (레포 템플릿)
   - 환경변수 키/기본값 안내
   - 수정 주체: 개발자

## 주요 환경변수

- 인증/세션: `ADMIN_PASSWORD`, `FLASK_SECRET_KEY`, `SESSION_COOKIE_SECURE`
- OpenAPI: `NEXON_OPEN_API_KEY`, `OPENAPI_CACHE_DIR`, `OPENAPI_REFRESH_STALE`
- 배치 부하: `OPENAPI_BATCH_MAX_MATCHES`, `OPENAPI_BATCH_WINDOW_MATCHES`
- 배치 지연: `OPENAPI_BATCH_DELAY_MIN`, `OPENAPI_BATCH_DELAY_MAX`
- 발행 시각: `DAILY_PUBLISH_HOUR`, `DAILY_PUBLISH_MINUTE`
- 보안 헤더: `CSP_REPORT_ONLY`

## 변경 시 동기화 규칙

1. 설정 동작이 바뀌면 `README.md` + `docs/status/PROJECT_STATE.md` 동시 갱신
2. 운영 영향이 있으면 `docs/reports/YYYY/MM/`에 변경 노트 추가
3. 시크릿 값은 어떤 경우에도 Git 커밋 금지
