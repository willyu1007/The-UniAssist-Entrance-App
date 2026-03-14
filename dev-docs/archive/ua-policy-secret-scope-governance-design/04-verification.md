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
      - 分配任务 ID `T-021`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 新任务 bundle 结构与治理索引一致
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 将 `T-021` 状态推进到 `in-progress`
      - 回写单一审批账本、统一 `PolicyBinding` 外壳和 `workspace + environment overlay` 的 `SecretRef` 模型
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - 校验子包状态和冻结结论与治理索引一致

## Manual smoke checks
- Confirm the architecture doc explicitly answers:
  - 哪些动作必须进入治理流程
  - secret 和 scope 由谁持有主权
  - runtime / connector 最终只消费什么授权结果
  - 为什么不新建第二套治理审批对象
  - `PolicyBinding` 首版为什么采用统一外壳

## Rollout / Backout (if applicable)
- Rollout:
  - 先冻结治理模型，再决定是否拆独立 implementation tranche
- Backout:
  - 若后续平台不做统一治理，归档该任务而不是把治理逻辑散落回执行体
