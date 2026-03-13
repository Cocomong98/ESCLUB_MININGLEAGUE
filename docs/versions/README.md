# Versions

릴리스 단위 변경 내역을 기능별 파일로 분리해 관리합니다.

## 폴더 규칙

- 경로: `docs/versions/v<major>.<minor>.<patch>/`
- 파일: 기능 단위 Markdown
  - 예: `frontend_*.md`, `backend_*.md`, `security_*.md`, `docs_*.md`

## 작성 규칙

1. 한 파일에는 한 기능군만 기록
2. 필수 항목:
   - 배경
   - 적용 범위
   - 주요 변경
   - 검증 포인트
   - 롤백 포인트
3. 코드 반영 시 관련 버전 폴더 문서도 함께 갱신

## 현재 버전 문서

- `docs/versions/v3.6.1/`
