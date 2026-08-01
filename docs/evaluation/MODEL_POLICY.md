# 평가 모델 정책

| 모드 | 용도 | 권장 모델 |
|---|---|---|
| `full` | 최초 전체 평가 | GPT-5.6 Sol |
| `regression` | 수정 후 회귀 평가 | GPT-5.6 Terra |
| `release` | 배포 직전 점검 | GPT-5.6 Luna 또는 Terra |

다음 항목이 포함되면 `full` 또는 `regression`이라도 GPT-5.6 Sol을 권장한다.

- 관리자 인증·권한
- 비밀정보·세션·쿠키
- Nexon API 데이터 정합성
- 시즌 분리 및 누적 채굴량 계산
- Docker·Nginx·Supervisor·NAS 배포 장애

이 정책은 Skill이 읽는 권장 규칙이다. Skill이 현재 Codex 모델을 강제로 변경하지는 않는다. 평가 시작 시 선택한 모드와 권장 모델을 보고서에 기록한다.

```text
mode: full
recommended_model: GPT-5.6 Sol
actual_model: <실제 사용 모델>
commit: <커밋 SHA>
evaluated_at: <Asia/Seoul 시간>
```
