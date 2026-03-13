# Security: CSP Route Split

## 배경

- 운영 페이지와 관리자 페이지의 스크립트 요구사항이 달라 단일 CSP로는 보안/호환성 균형이 어려움.

## 적용 범위

- `app.py` CSP 응답 헤더 설정
- `.env.example`
- 보안/운영 문서(`README`, `PROJECT_STATE`, `docs/security.md`)

## 주요 변경

- 경로별 CSP 분리:
  - 일반 페이지: `unsafe-eval` 제거
  - 관리자 페이지: 호환성 이유로 `unsafe-eval` 유지
- `CSP_REPORT_ONLY` 토글 추가

## 검증 포인트

- `curl -I /tables`에서 일반 CSP 정책 확인
- `curl -I /admin`에서 관리자 CSP 정책 확인
- Report-Only 모드 전환 시 차단 대신 보고 헤더 확인

## 롤백 포인트

- `resolve_csp_policy(path)` 기반 분기 전체
