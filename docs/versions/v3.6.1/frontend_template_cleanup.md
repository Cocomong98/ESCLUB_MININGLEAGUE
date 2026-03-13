# Frontend: Template Cleanup (Phase 2)

## 배경

- 운영 라우트와 연결되지 않은 템플릿 페이지/데이터가 코드베이스에 남아 유지보수 비용을 높였습니다.

## 적용 범위

- `src/layouts/authentication/**`
- `src/layouts/billing/**`
- `src/layouts/profile/**`
- `src/layouts/rtl/**`
- `src/layouts/notifications/index.js`
- `src/layouts/dashboard/data/*`
- `src/layouts/dashboard/components/{OrdersOverview,Projects}/**`
- `src/layouts/tables/data/*`
- `src/routes.js`의 관련 주석 라우트 정리

## 주요 변경

- 미사용 템플릿 레이아웃 및 하위 컴포넌트 삭제
- 템플릿 샘플 데이터 모듈 삭제
- 삭제된 페이지를 가리키는 주석 import/주석 route 정리

## 검증 포인트

- `npm run build` 성공
- `python3 -m py_compile app.py` 성공
- 서비스 경로(`/tables`, `/dashboard/:id`, `/dashboard/:id/squad`, `/hall-of-fame`, `/admin`) 영향 없음

## 롤백 포인트

- 본 문서의 적용 범위에 나열된 파일 삭제 커밋 전체
