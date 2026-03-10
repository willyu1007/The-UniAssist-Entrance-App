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
      - 分配任务 ID `T-022`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 新任务 bundle 结构与治理索引一致
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 将 `T-022` 状态推进到 `in-progress`
      - 回写“变更/发布协作”为主、三类能力组合和最低压测要求
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 校验子包状态和冻结结论与治理索引一致

## Manual smoke checks
- Confirm the architecture doc explicitly answers:
  - 第二验证场景的完整 flow 是什么
  - 它如何压测 connector/action/event bridge/governance
  - 哪些复杂度属于 runtime/preset，哪些属于平台硬缺口
  - 为什么第二验证场景首版选“变更/发布协作”
  - 为什么首版能力组合只强制包含三类

## Rollout / Backout (if applicable)
- Rollout:
  - 先完成第二验证场景设计冻结，再决定何时进入 connector/runtime implementation 验证
- Backout:
  - 若暂不推进第二验证场景，保留教学场景为主线，但不得再宣称“已完整覆盖 v0.2”
