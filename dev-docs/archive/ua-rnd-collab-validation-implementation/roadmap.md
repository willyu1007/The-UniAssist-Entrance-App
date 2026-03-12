# R&D Collaboration Validation Implementation — Roadmap

## Goal
- 交付 `T-011 / B8` 的研发协作验证实施包：在不新开 northbound API、不改 Prisma schema 的前提下，跑通主变更流与伴随事件流，验证 `issue_tracker + source_control + ci_pipeline`、治理写操作、同一 run callback 续跑与 `event_subscription` 触发。

## Parent references
- `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
- `dev-docs/active/ua-rnd-collab-validation-scenario-design/02-architecture.md`
- `dev-docs/active/ua-connector-runtime-and-first-capabilities-implementation/02-architecture.md`
- `dev-docs/active/ua-agent-governance-implementation/02-architecture.md`
- `dev-docs/active/ua-control-console-foundation-implementation/02-architecture.md`

## Frozen implementation choices
- `B8` 是独立 implementation bundle，不并入 `B7`，也不回写为 `T-022` 设计包的后续文档。
- 场景固定为两条 workflow：
  - 主变更流：`capture_change_intent -> synthesize_execution_plan -> risk_review -> issue_upsert -> change_review_upsert -> pipeline_start -> summarize_delivery -> finish`
  - 伴随事件流：`pipeline.finished event_subscription -> capture_validation_signal -> issue_upsert -> finish`
- `source_control` 首版只实现 generic `change_review.upsert` write action。
- `ci_pipeline.pipeline.finished` 同时覆盖：
  - 主变更流中的 same-run async callback
  - 伴随事件流中的 event subscription trigger
- 控制台不新增页面；只在现有 runs/approvals 视图内增强 artifact inspection。

## Non-goals
- 不新增 Prisma 表或 northbound REST endpoint
- 不接真实厂商 API
- 不把 `event_subscription` 强耦合进主流程状态机
- 不新增 connector admin UI 或专用 R&D 页面
- 不实现 branch create/push 语义

## Execution phases
1. Task bundle + governance bootstrap
2. Scenario docs + workflow contracts/helper
3. Compat executor + source control connector
4. Runtime/platform test coverage for primary flow and companion flow
5. Control console artifact inspection enhancement
6. Verification / governance sync / handoff update

## Acceptance gates
- Scenario:
  - `docs/scenarios/rnd-collab` 明确主变更流、伴随事件流、输入/事件 fixture 与预期 artifacts
- Runtime:
  - 主变更流在审批后完成两个 write action、CI callback 续跑与 `DeliverySummary`
  - callback duplicate / out-of-order 继续被拒绝
- Governance:
  - 两个 write-capable action binding 在审批前不可执行
  - `event_subscription` 启用后可从 `pipeline.finished` 触发 companion run
- Console:
  - runboard 可查看 artifact typed payload / lineage
  - approvals evidence preview 继续展示 `ChangeIntent` / `ExecutionPlan`
