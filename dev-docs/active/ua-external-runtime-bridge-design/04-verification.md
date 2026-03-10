# 04 Verification

## Automated checks
- Planning/gov sync:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`

### Results
- 2026-03-11:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 创建 `.ai-task.yaml`
      - 分配任务 ID `T-020`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 新任务 bundle 结构与治理索引一致
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 将 `T-020` 状态推进到 `in-progress`
      - 回写 bridge registry owner、首版 command/callback contract 和 normalized envelope handoff
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 校验子包状态和冻结结论与治理索引一致

## Manual smoke checks
- Confirm the architecture doc explicitly answers:
  - bridge 与 platform/runtime 各自拥有什么主权
  - invoke/checkpoint/callback 的 handoff 是什么
  - formal artifact/approval/delivery 由谁落账
  - bridge 为什么不属于 connector registry
  - 为什么首版 callback 只收敛到四类

## Rollout / Backout (if applicable)
- Rollout:
  - 先完成 bridge 设计冻结，再决定是否起 `executor-bridge-*` implementation
- Backout:
  - 若暂不接入外部 runtime，归档本任务但保留平台主线不变
