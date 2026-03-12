# 01 Plan

## Phases
1. Governance bootstrap
2. Scenario docs + workflow contracts
3. Sample connector + compat executor path
4. Runtime/platform validation flows
5. Control-console artifact inspection
6. Verification and handoff sync

## Detailed steps
- 建立 `B8` task bundle，并运行 project governance sync/lint。
- 在 `packages/workflow-contracts` 增加研发协作 typed payload、canonical template builder 与 fixture helpers。
- 新增 `docs/scenarios/rnd-collab`，沉淀 manual input、event fixture 与 expected artifacts。
- 新增 `apps/connectors/source-control-sample`，提供 `change_review.upsert` write action，并产出 `ActionReceipt`。
- 扩 `apps/provider-sample` 的 compat executor 分支，支持主流程和伴随事件流的 scenario artifacts。
- 扩 `apps/workflow-runtime` 和 `apps/workflow-platform-api` 测试，验证：
  - 主变更流 approval -> write actions -> CI callback -> `DeliverySummary`
  - `event_subscription` 触发 companion flow
  - callback duplicate / out-of-order guardrails 不退化
- 在 `apps/control-console` 复用 `/v1/artifacts/:artifactId` 增强 runs 详情 artifact inspection，并补测试。
- 记录 verification，并在任务末尾同步 governance/handoff 文档。

## Risks & mitigations
- Risk: 为了展示 artifact 详情而新增 API。
  - Mitigation: 优先复用 `/v1/artifacts/:artifactId`，只在前端侧补查询与展开逻辑。
- Risk: 伴随事件流把 `event_subscription` 强耦合回主流程。
  - Mitigation: companion flow 作为独立 workflow helper 和独立测试断言，不改主流程状态机。
- Risk: `source_control` connector 膨胀成真实 repo 写入模型。
  - Mitigation: 首版 action 固定为 `change_review.upsert`，只产出 generic `ActionReceipt`。
