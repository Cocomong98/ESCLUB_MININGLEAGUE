# Backend: OpenAPI Scheduler/Fallback

## 배경

- OpenAPI 호출 실패(429/점검/응답 지연)와 시즌 범위 누락으로 분석 배치 실패 사례가 존재.

## 적용 범위

- `app.py`
- `fconline_openapi/*`
- `config/season_config.json` 연동 로직

## 주요 변경

- 체인 잡(`crawl_openapi_chain`)으로 전적 크롤링 후 OpenAPI 분석 순차 실행
- 2시간 간격 `:10` 배치 운영
- 일별 발행 게이트(A안): 일 스냅샷 발행은 하루 1회
- 시즌 범위 누락 시 데이터 파일 기반 fallback 추정 추가
- 배치 부하 제어 env(`OPENAPI_BATCH_*`, `DAILY_PUBLISH_*`) 문서화

## 검증 포인트

- `python3 app.py openapi-selftest` 성공
- 특정 유저 분석 수동 실행 성공 (`openapi-update-analysis`)
- 시즌 범위 누락 상황에서 fallback 로그 출력 후 분석 지속

## 롤백 포인트

- 체인 스케줄 구성
- 시즌 범위 fallback 분기
- 일별 발행 게이트 로직
