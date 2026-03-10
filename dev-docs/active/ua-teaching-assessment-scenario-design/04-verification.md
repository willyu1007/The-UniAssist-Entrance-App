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
  - 首条教学 workflow 的端到端流程是什么
  - agent 如何收敛为四类正式对象
  - 为什么交付前必须 review
  - team confirmation 和 audience/fan-out 如何工作

## Results
- 2026-03-10:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 分配任务 ID `T-017`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `.ai-task.yaml` 已生成且治理校验通过
- 2026-03-11:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - `T-017` 状态与 overview 已同步为 `in-progress`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 平台通用字段与教学验证场景边界纠偏后的文档校验通过

## Rollout / Backout (if applicable)
- Rollout:
  - Register the design subtask
  - Use it as the acceptance baseline for future teaching implementation
- Backout:
  - If the scenario proves too broad, preserve the convergence contract and split delivery-specific details into a later scenario extension
