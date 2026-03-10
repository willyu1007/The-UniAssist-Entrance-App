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
  - 哪些对象是 authoritative，哪些只是 projection
  - `actor/delivery` 是否进入 `P1`
  - `TimelineEvent` 与 `task_question/task_state` 的真实来源
  - actor graph 与 delivery spec 如何为首批验证场景和控制台提供稳定锚点

## Results
- 2026-03-10:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - 分配任务 ID `T-018`
      - 更新 `registry.yaml`, `dashboard.md`, `feature-map.md`, `task-index.md`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `.ai-task.yaml` 已生成且治理校验通过
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - Result: pass
    - Notes:
      - `T-018` 状态推进到 `in-progress`
      - 总包与子包现在都将 `T-018` 视为已冻结数据面基线
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
    - Result: pass
    - Notes:
      - `T-018` 的状态、总包引用和治理索引一致

## Rollout / Backout (if applicable)
- Rollout:
  - Register the design subtask
  - Use it as the object-boundary baseline for builder/teaching/console design
- Backout:
  - If the scope proves too broad, split out actor/delivery as a separate design subtask before any implementation starts
