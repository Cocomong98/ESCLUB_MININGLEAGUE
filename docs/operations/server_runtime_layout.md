# Server Runtime Layout (NAS 기준)

작성일: 2026-03-13 (KST)

## 목적

- 서버 접속 시 로컬과 경로 구조가 달라 발생하는 혼선을 줄이기 위한 런타임 기준 문서.

## 기준 경로

- 컨테이너 작업 경로: `/app`
- 실행 엔트리: `/app/app.py`
- 관리자 자산: `/app/admin/admin.html`, `/app/admin/admin-panel.js`
- 운영 설정: `/app/config/season_config.json`, `/app/config/managers.json`
- 정적 리소스: `/app/build`, `/app/static`(보통 `build/static` 링크)
- 런타임 데이터: `/app/data`
- 환경변수 파일: `/app/.env`

## 배포 후 확인 명령

```bash
pwd
ls -al /app
ps -ef | grep -E "python|gunicorn" | grep -v grep
grep -n "def resolve_csp_policy" /app/app.py
```

## 경로 혼동 방지 원칙

1. 서버에서 경로 확인은 항상 절대경로(`/app/...`) 기준으로 수행
2. 로컬 경로와 서버 경로를 혼용해 판단하지 않음
3. `find / -name app.py` 결과가 여러 개여도 실행 프로세스 기준 파일만 신뢰
