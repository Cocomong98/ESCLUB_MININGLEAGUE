# Deploy (GUI Drag & Drop) File Replacement Guide

작성일: 2026-03-13 (KST)

## 목적

- GUI 기반 업로드 시 어떤 파일을 교체해야 하는지 명확히 규정.

## 기본 원칙

1. `data/`는 운영 데이터이므로 무분별한 전체 덮어쓰기 금지
2. `.env`는 서버 현장에서 직접 관리(로컬 파일 그대로 업로드 금지)
3. 프론트 변경이 있으면 `build/` 산출물 동기화가 필수

## 교체 대상(프론트+백엔드 동시 변경 시)

- `app.py`
- `admin.html`
- `admin-panel.js`
- `fconline_openapi/` (변경 파일)
- `build/index.html`
- `build/static/*`
- `season_config.json` (정책 변경 시)
- `managers.json` (관리 대상 변경 시)

## 보통 교체하지 않는 대상

- `data/*` (운영 중 누적 데이터)
- `.env`
- `.private/*` (락/캐시 상태)

## 반영 확인 체크

```bash
python3 -m py_compile app.py
python3 app.py openapi-selftest
curl -I http://127.0.0.1/tables | grep -i content-security-policy
curl -I http://127.0.0.1/admin | grep -i content-security-policy
```
