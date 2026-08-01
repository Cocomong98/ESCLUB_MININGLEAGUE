---
name: fullstack-audit
description: ESCLUB_MININGLEAGUE를 기획, UX, 프론트엔드, Flask 백엔드, Nexon Open API 데이터, 보안, Docker 운영 관점에서 읽기 전용으로 감사한다.
---

# Fullstack Audit

## 실행 전

1. `docs/evaluation/MODEL_POLICY.md`를 읽고 평가 모드와 권장 모델을 확인한다.
2. `git status --short`와 현재 커밋 SHA를 기록한다.
3. `AGENTS.md`, `docs/PROJECT_OPERATIONS.md`, `docs/evaluation/RUBRIC.md`를 읽는다.
4. `.env`, `.private`, `node_modules`, `.venv`, `public/data`의 대량 런타임 파일은 검사 범위를 조정한다.

## 평가 모드

- `full`: 전체 기획·디자인·개발·데이터·운영 감사. Sol 권장.
- `regression`: 최근 변경과 기존 기능의 회귀 감사. Terra 권장.
- `release`: 배포 직전 빌드·라우팅·API·반응형·운영 점검. Luna 또는 Terra 권장.

모드가 불명확하면 Terra를 사용하고, 인증·관리자 권한·비밀정보·데이터 정합성·배포 장애가 포함되면 Sol을 권장한다. Skill은 모델을 강제로 변경하지 않는다. 시작 보고서에 선택 모드와 권장 모델을 명시한다.

## 검사 순서

1. 프로젝트 구조와 실행 경로를 확인한다.
2. 기획·기능 누락을 검사한다.
3. PC·모바일 UI, 다크·라이트 모드, 빈 상태, 오류 상태, 모달과 라우팅을 검사한다.
4. React/TanStack Start 구조, 타입, 상태, API 경계를 검사한다.
5. Flask 백엔드, Nexon Open API 호출·캐시·시즌 분리·관리자 API를 검사한다.
6. Docker, Nginx, Supervisor, NAS 볼륨, 환경 변수를 검사한다.
7. 가능한 범위에서 `npm run lint`, `npm run build`, `npm run backend:check`를 실행한다.
8. 브라우저 도구가 사용 가능하면 주요 사용자 흐름과 PC·모바일 화면을 확인한다.
9. 보고 전 파일 경로, 심벌, 실행 경로, 재현 조건을 재검증한다.

## 변경 금지

- 감사 중 소스코드, 설정, 데이터, Git 이력을 수정하지 않는다.
- 자동 수정은 감사 보고서와 별도 승인 후 수행한다.
- 근거 없는 추정은 Finding이 아니라 `검증 필요`로 분류한다.

## 보고서

모든 결과는 `docs/evaluation/reports/<날짜>-<모드>-<커밋>/`에 저장한다. 각 Finding에는 심각도, 영역, 파일 경로와 심벌, 영향, 재현 절차, 근거, 수정 방향, 검증 방법, 확신도를 포함한다.
