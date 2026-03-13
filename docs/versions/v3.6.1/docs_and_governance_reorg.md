# Docs: Governance/Reorg

## 배경

- 루트에 작업성 문서가 누적되어 탐색/인수인계 비용 증가.

## 적용 범위

- `docs/` 하위 인덱스/분류 구조
- 문서 참조 링크 갱신

## 주요 변경

- 문서 인덱스 도입 및 카테고리 분리
- 루트 문서 일부를 `docs/reports`, `docs/specs`, `docs/changelog`로 이관
- 거버넌스 규칙(`docs/policies/git_and_docs_governance.md`) 정리

## 검증 포인트

- `docs/README.md` 기준으로 문서 위치를 찾을 수 있는지 확인
- 기존 참조 문서(README/PROJECT_STATE) 링크 무결성 확인

## 롤백 포인트

- docs 트리 재구성 및 경로 이관
