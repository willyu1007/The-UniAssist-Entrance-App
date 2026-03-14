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
      - 分配任务 ID `T-019`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 新任务 bundle 结构与治理索引一致
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 将 `T-019` 状态推进到 `in-progress`
      - 回写 `1:N` relationship、trigger split rule、agent lifecycle naming
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 校验子包状态和冻结结论与治理索引一致

## Manual smoke checks
- Confirm the architecture doc explicitly answers:
  - 为什么不是每个 workflow 都会升格为 agent
  - `activate` 和 `publish` 的区别
  - trigger config 由谁拥有、由谁分发
  - 为什么 `WorkflowTemplateVersion` 与 `AgentDefinition` 不是 `1:1`
  - 哪些 trigger 必须通过 active agent

## Rollout / Backout (if applicable)
- Rollout:
  - 先完成设计冻结，再决定是否新开 agent/scheduler implementation 包
- Backout:
  - 若后续平台不再需要长期 agent，归档本设计包而不是把其语义混回 workflow template
