# Git & Documentation Governance

작성일: 2026-03-13 (KST)

본 문서는 이 저장소의 브랜치/커밋/문서 관리 기준을 정리합니다.

## 1) 브랜치 정책

기본 원칙:

1. `master`는 운영 기준 브랜치로 간주
2. 명시적 요청 없이는 `master` 직접 푸시 금지
3. 권장 흐름:
   - `add-*` (기능 브랜치) -> `release/*` -> `master`

## 2) 커밋 정책

1. 커밋은 기능 단위로 분리
   - 예: `security`, `frontend`, `scheduler`, `docs`, `deploy`
2. 한 커밋에는 하나의 의도만 담기
3. 커밋 메시지는 변경 목적이 드러나야 함
4. 변경마다 `CHANGELOG.md` 반영 유지
   - 자동 훅/스크립트 사용 가정
   - `<!-- auto-commit-log:start -->`, `<!-- auto-commit-log:end -->` 마커 삭제 금지

## 3) 문서 정책

핵심 문서:

- `README.md`
- `docs/status/project_summary.md` (정본)
- `docs/status/PROJECT_STATE.md` (정본)
- `CHANGELOG.md`

기타 문서(`docs/`):

- 정책: `docs/policies/`
- 버전별 기능 기록: `docs/versions/vX.Y.Z/`
- 운영 절차/서버 구조: `docs/operations/`
- 설정/데이터 참조: `docs/references/`
- 운영/보안: `docs/security.md`, `docs/csp_hardening_rollout.md` 등
- 작업 노트: `docs/reports/YYYY/MM/YYYY-MM-DD_<topic>.md`

## 4) 중간 산출물(작업 노트) 규칙

1. 파일명: `YYYY-MM-DD_<topic>.md`
2. 필수 섹션:
   - 배경/목표
   - 변경사항
   - 검증 결과
   - 리스크/롤백
   - 후속 TODO
3. 단기 메모라도 루트에 난립시키지 않고 `docs/reports/` 하위에 저장

## 5) 업데이트 트리거

아래 변경이 있으면 같은 작업에서 문서 동기화:

1. 아키텍처 변경
2. API 동작/응답 변경
3. 배포 절차 변경
4. 데이터 경로/정책 변경

우선순위:

1. `docs/status/project_summary.md`
2. `docs/status/PROJECT_STATE.md`
3. 필요 시 `README.md`/운영 노트

## 6) 보안/시크릿 규칙

1. 실제 시크릿은 Git 커밋 금지
2. `.env`는 런타임에서만 관리
3. `docker-compose.yaml`은 추적 제외, 템플릿은 `docker-compose.example.yaml` 유지
