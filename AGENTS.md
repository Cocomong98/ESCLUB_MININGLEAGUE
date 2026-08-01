<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## 프로젝트 평가

전체 평가, 회귀 평가, 배포 전 점검 요청이 들어오면 프로젝트 내부
`.codex/skills/fullstack-audit/SKILL.md`와 `docs/evaluation/` 기준을 우선 적용한다.

- `full`: 최초 전체 평가, GPT-5.6 Sol 권장
- `regression`: 수정 후 회귀 평가, GPT-5.6 Terra 권장
- `release`: 배포 전 점검, GPT-5.6 Luna 또는 Terra 권장

평가 중 소스코드와 설정을 수정하지 않는다. 평가 결과를 먼저 보고하고,
수정은 별도 승인 후 수행한다.
