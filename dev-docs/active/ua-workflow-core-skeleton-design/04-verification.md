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
  - `/v0/ingest` 命中 workflow 后谁接手
  - `start-run` 和 `resume-run` 谁发命令、谁执行
  - runtime 状态如何进入当前 timeline
  - continuation 为何不是 runtime 自己循环，也不是全部塞进 worker
  - 为什么 `AgentDefinition` 不进 `P1`

## Results
- 2026-03-10:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 分配任务 ID `T-012`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `.ai-task.yaml` 已存在且治理索引通过
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - `T-012` 状态推进到 `in-progress`
      - 总包与子包现在都将 `T-012` 视为已冻结骨架基线
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `T-012` 的状态、总包引用和治理索引一致

## Rollout / Backout (if applicable)
- Rollout:
  - Register the design subtask
  - Reference it from `T-011`
- Backout:
  - If the subtask proves too broad, split by concern before any implementation task starts
