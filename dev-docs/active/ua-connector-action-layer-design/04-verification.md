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
  - connector 和 executor/provider 的区别
  - action 为什么不是 workflow node
  - auth/policy/secret binding 归谁管
  - browser fallback 为什么不是主运行时

## Results
- 2026-03-10:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 分配任务 ID `T-014`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `.ai-task.yaml` 已生成且治理校验通过
- 2026-03-11:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - `T-014` 状态与 overview 已同步为 `in-progress`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - catalog 分离 / invoke contract 统一 与 EventBridge ownership 边界已通过治理校验

## Rollout / Backout (if applicable)
- Rollout:
  - Register the design subtask
  - Use it as the baseline for future external integration design
- Backout:
  - If scope proves too broad, preserve connector/action boundary and split browser fallback into a separate extension design task
