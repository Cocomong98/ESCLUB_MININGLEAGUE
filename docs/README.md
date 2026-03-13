# Documentation Index

이 폴더는 개발/운영 문서를 일관된 규칙으로 관리하기 위한 기준 위치입니다.

## 문서 분류

- `docs/policies/`
  - 협업 규칙, 브랜치/커밋 규칙, 문서 생성 규칙
- `docs/versions/`
  - 릴리스 버전별 기능 단위 변경 문서
- `docs/operations/`
  - 서버 런타임 구조, 배포 교체 절차, 운영 체크리스트
- `docs/references/`
  - 설정 파일/환경변수 카탈로그, 데이터 파일 정책
- `docs/status/`
  - 프로젝트 요약/현재 상태 문서(정본)
- `docs/security.md`
  - 보안 운영 메모
- `docs/csp_hardening_rollout.md`
  - CSP 단계 강화 계획
- `docs/openapi_manager_mode_analytics.md`
  - OpenAPI 분석 설계/운영 참고
- `docs/specs/`
  - 스키마/계약 문서 (`weekly_report_schema.md` 등)
- `docs/changelog/`
  - 버전 정책/근거 문서 (`changelog_semver.md`)
- `docs/templates/`
  - 신규 보고서/패치 노트 템플릿
- `docs/reports/`
  - 날짜 기반 운영 노트/중간 산출물 저장 위치

## 핵심 문서 위치

- `README.md` (사용/배포 개요)
- `docs/status/project_summary.md` (프로젝트 요약, 정본)
- `docs/status/PROJECT_STATE.md` (현재 상태/운영 정책, 정본)
- `CHANGELOG.md` (커밋 로그 자동 반영 구간 포함)

루트의 `project_summary.md`, `PROJECT_STATE.md`는 호환용 안내 파일입니다.

## 신규 문서 생성 규칙

1. 정책/영구 규정 문서:
   - `docs/policies/`에 생성
2. 일회성 작업 보고/배포 노트:
   - `docs/reports/YYYY/MM/` 하위에 생성
3. 버전 고정 기능 문서:
   - `docs/versions/vX.Y.Z/` 하위에 생성
4. 파일명:
   - `YYYY-MM-DD_<topic>.md` (영문 소문자 + 스네이크 케이스 권장)
5. 문서 머리말:
   - 작성일(KST), 작성 목적, 적용 범위, 롤백/주의점 포함

## 마이그레이션 원칙

- 일회성 문서는 루트가 아닌 `docs/reports/`로 관리
- 스키마/버전 근거 문서는 `docs/specs/`, `docs/changelog/`로 관리
