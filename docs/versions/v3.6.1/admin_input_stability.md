# Admin: Input Stability

## 배경

- 관리자 UI에서 이름 입력 시 커서 점프/행 이동 현상이 보고됨.

## 적용 범위

- `admin/admin.html`
- `admin/admin-panel.js`

## 주요 변경

- 입력 이벤트 처리 흐름 정리(한글/영문 조합 입력 안정성 확보)
- 포커스 이동 조건 보정
- 인라인 스크립트 분리(`admin/admin-panel.js`)로 유지보수성 개선

## 검증 포인트

- Shift+알파벳 입력 시 커서 위치 유지
- 입력 중 다른 행으로 포커스 이동 미발생

## 롤백 포인트

- admin 입력 핸들러/포커스 제어 변경분
