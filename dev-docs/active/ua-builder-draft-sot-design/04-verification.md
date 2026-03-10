# 04 Verification

## Automated checks
- Governance sync:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
- Governance lint:
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`

## Manual smoke checks
- Confirm the bundle contains:
  - `roadmap.md`
  - `00-overview.md`
  - `01-plan.md`
  - `02-architecture.md`
  - `03-implementation-notes.md`
  - `04-verification.md`
  - `05-pitfalls.md`
- Confirm the architecture doc explicitly answers:
  - draft SoT 放在哪里
  - chat 和 control console 如何共同编辑同一 draft
  - publish 与 activate/bind/schedule/external write 如何分层
  - recipe draft 如何从 run/evidence 形成并晋升

## Results
- 2026-03-10:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 分配任务 ID `T-013`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `.ai-task.yaml` 已生成且治理校验通过

## Rollout / Backout (if applicable)
- Rollout:
  - Register the design subtask
  - Use it as the Builder and Studio design baseline
- Backout:
  - If scope is too broad, split recipe-promotion details from general draft SoT before implementation starts
