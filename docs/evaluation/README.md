# 평가 사용법

## 평가 모드

```text
전체 프로젝트를 처음 평가        → full
수정 후 회귀 여부 확인            → regression
NAS/Docker 배포 직전 확인         → release
```

모델 정책은 `MODEL_POLICY.md`를 따른다. 평가 프롬프트에 모드를 반드시 적는다.

## Codex 실행 프롬프트

```text
현재 프로젝트의 .codex/skills/fullstack-audit/SKILL.md를 적용하라.
평가 모드는 full이다.
소스코드와 설정을 수정하지 말라.
현재 커밋, 작업 트리, 실제 실행 명령을 기록하라.
docs/evaluation/RUBRIC.md와 TEST_SCENARIOS.md를 기준으로 평가하라.
가능한 린트·빌드·백엔드 검사와 브라우저 검사를 실행하라.
발견 사항은 근거, 파일 경로, 재현 절차, 심각도, 수정 방향과 함께 보고하라.
```

회귀 평가는 `full`을 `regression`으로, 배포 전 점검은 `release`로 바꾼다.

## 보고서 저장

```text
docs/evaluation/reports/YYYY-MM-DD-<mode>-<commit>/report.md
```

보고서에는 모드, 권장 모델, 실제 모델, 커밋, 평가 시각, 검사 결과, 발견 사항, 미검증 항목을 기록한다.

## 평가 후 수정

평가와 수정은 분리한다. 보고서의 Blocker·High 항목을 사용자가 승인한 뒤 항목별로 수정하고, 같은 모드의 회귀 평가를 다시 실행한다.

```text
full 평가 → 문제 승인 → 수정 → regression 평가
release 점검 → 배포 → 실제 URL 재점검
```
