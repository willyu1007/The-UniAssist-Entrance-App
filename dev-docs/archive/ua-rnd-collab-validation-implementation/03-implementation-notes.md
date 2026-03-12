# 03 Implementation Notes

## Delivered changes
- 已创建 `B8 / ua-rnd-collab-validation-implementation` task bundle，并完成 governance sync。
- 新增 `docs/scenarios/rnd-collab/README.md`、`canonical-input.json`、`event-fixture.json`、`expected-artifacts.json`，固定主变更流与 companion event flow 的 canonical 输入、事件与 artifact 验收面。
- `packages/workflow-contracts` 新增 `ChangeIntentPayload`、`ExecutionPlanPayload`、`DeliverySummaryPayload`、`RndCollabValidationArtifactPayload`，并增加 `rnd-collab-scenario` helper 导出 canonical workflow spec / template / fixture builder。
- 新增 `apps/connectors/source-control-sample`，首版仅提供 `source_control.change_review.upsert` generic write capability，输出 `ActionReceipt`。
- `apps/connector-runtime` 已注册 `source_control-sample`；`apps/provider-sample` 的 `compat-sample` 分支已补齐 `capture_change_intent`、`synthesize_execution_plan`、`summarize_delivery`、`capture_validation_signal` 四类 metadata / artifact seed。
- `apps/control-console` 复用现有 `/v1/artifacts/:artifactId`，在 runs 页面增加按 artifact 展开 detail 的最小 inspection，直接显示 typed payload 与 lineage。
- 新增 `apps/workflow-runtime/tests/rnd-collab-validation.test.mjs` 与 `apps/workflow-platform-api/tests/rnd-collab-validation.test.mjs`，覆盖主变更流、same-run callback 续跑、重复/乱序 callback 拒绝，以及 `event_subscription` companion run dispatch。
- 为保证 `pnpm --filter @baseinterface/workflow-runtime test` 可稳定通过，顺手修复了既有 B6/B7 runtime tests 的端口冲突：`external-runtime-bridge` 改用独立端口，不影响运行时代码路径。

## Initial decisions
- task slug 固定为 `ua-rnd-collab-validation-implementation`
- `source_control` 首版 action 固定为 `change_review.upsert`
- 伴随事件流采用独立 workflow helper，不和主变更流做单流强耦合
- 控制台优先复用 `/v1/artifacts/:artifactId` 实现 run artifact inspection

## Deferred decisions
- 如实现中发现 artifact detail 的 UI 需要额外状态归类，再根据现有 component 边界决定是否新增极小的 shared renderer
- `source_control` 是否扩到 branch / push / webhook ingress，留待后续 capability tranche 单独决策

## Closure follow-up
- 根据实现后 review 结果，sample connectors 的 canonical ref 解析统一补到了顶层 input、嵌套 `input` 和 `__workflow.runInput` 三个入口，避免 `ActionReceipt` 与 `DeliverySummary` 在同一 run 中出现冲突的 issue / change-review / pipeline ref。
- `RndCollabValidationArtifactPayload` 已补入 companion flow 使用的 `ValidationReportPayload`，让场景 helper 暴露的 artifact contract 与实际 workflow 产物一致。
- runtime B8 test 已补充 `UA-101`、`CR-101`、`pipeline:case-1` 的显式断言，作为 closure guard，防止后续 connector/sample payload 漂移时静默退化。
