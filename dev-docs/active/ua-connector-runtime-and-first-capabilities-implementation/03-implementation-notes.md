# 03 Implementation Notes

## 2026-03-12
- 初始化 `B7 / ua-connector-runtime-and-first-capabilities-implementation` task bundle。
- project governance 已分配任务 ID `T-029`，并同步 `.ai/project/main/*`。
- 冻结实现选择：
  - `apps/connector-runtime` 独立部署
  - `issue_tracker + ci_pipeline` 为首批 capability
  - `webhook-first` event bridge
  - `CI` callback 续跑同一个 run/node
  - connector executor 节点复用现有 `executor` node type，只通过 `actionRef` 解析 binding
- 当前阶段目标：
  - 先完成 contracts / schema / platform inventory
  - 再落 connector runtime 与 workflow runtime 接线

## Contracts / Schema
- 新增 `packages/workflow-contracts/src/connector-runtime.ts`，定义：
  - control-plane records：`ConnectorDefinition / ConnectorBinding / ActionBinding / EventSubscription`
  - runtime ledger：`ConnectorActionSession / ConnectorEventReceipt`
  - northbound CRUD DTO
  - runtime invoke/callback/event-subscription config/dispatch DTO
- 扩展 `agent-governance.ts`：
  - `GovernanceTargetType` 支持 `connector_binding / action_binding / event_subscription`
  - `TriggerDispatchRecord.sourceType` 支持 `event_subscription`
- 扩展 `WorkflowRuntimeStartRunRequest`：
  - 支持 `connectorActions`
  - `sourceType` 加入 `event_subscription`
- Prisma 新增 6 个 additive model：
  - `ConnectorDefinition`
  - `ConnectorBinding`
  - `ActionBinding`
  - `EventSubscription`
  - `ConnectorActionSession`
  - `ConnectorEventReceipt`

## Platform API
- `GovernanceRepository` 补齐 connector/event-subscription 的 memory + postgres CRUD / lookup / lock 实现。
- `PlatformService` 已实现：
  - connector definition / binding / action binding / event subscription CRUD
  - connector executor draft validation：必须有 `config.actionRef`，禁止模板固化 binding id
  - `startManagedAgentRun` 动态解析 agent-scoped `ActionBinding`，只为模板里实际引用的 `actionRef` 注入 snapshot
  - write-capable action binding 启动前强制要求 `invoke` policy binding 已通过 `external_write_allow`
  - `event_subscription` trigger enable 从 B5 禁用改为：
    - 若无对应 `EventSubscription`，返回 `EVENT_SUBSCRIPTION_REQUIRED`
    - 若存在订阅，则可走现有 governance enable 流程
  - internal route handler：
    - `getEventSubscriptionRuntimeConfig`
    - `dispatchEventSubscription`
- `platform-controller.ts` / `server.ts` 已新增：
  - `/v1/connector-definitions`
  - `/v1/connector-bindings`
  - `/v1/agents/:agentId/action-bindings`
  - `/v1/action-bindings/:actionBindingId`
  - `/v1/event-subscriptions`
  - `/internal/event-subscriptions/:publicSubscriptionKey/runtime-config`
  - `/internal/event-subscriptions/:publicSubscriptionKey/dispatch`

## Connector Runtime / SDK / Samples
- 新增 `packages/connector-sdk`：
  - connector adapter interface
  - normalized callback/event contract
  - connector runtime invoke client
- 新增 `apps/connector-runtime`：
  - sample adapter registry
  - `/internal/connectors/actions/invoke`
  - `/hooks/connectors/action-callbacks/:publicCallbackKey`
  - `/hooks/connectors/event-subscriptions/:publicSubscriptionKey`
  - internal downstream 错误改为透传 HTTP status/code，避免 out-of-order callback 被包成 500
- 新增 sample connectors：
  - `issue-tracker-sample`
    - `issue.upsert`
    - sync completed path
    - 产出 `ActionReceipt`
  - `ci-pipeline-sample`
    - `pipeline.start`
    - async accepted path
    - callback 产出 `ValidationReport`
    - webhook event `pipeline.finished`

## Workflow Runtime
- 新增 connector runtime client 与环境配置。
- connector executor 继续复用 `executor` node type，但在 runtime 分出第三条执行路径：
  - sync connector completion 直接创建 artifact 并推进后续 node
  - async connector invoke 生成 `ConnectorActionSession`
  - `/internal/runtime/connector-callback` 接收 callback 并在同一 run/node 上续跑
- runtime ledger 以 `InternalRunState + workflow_runs.metadata_json.connectorRuntime` 持久化：
  - 这样首轮实现不依赖立即执行 DB migration，也能跨 repository load/save 恢复 session/receipt
- callback guardrail 已实现：
  - duplicate callback -> duplicate receipt
  - out-of-order callback -> 409 `CONNECTOR_CALLBACK_OUT_OF_ORDER`
  - terminal session callback -> rejected receipt

## Tests
- 新增 `apps/workflow-platform-api/tests/connector-runtime-governance.test.mjs`
  - 覆盖 connector control-plane CRUD、`external_write_allow` gating、event-subscription runtime-config/dispatch
- 新增 `apps/workflow-runtime/tests/connector-runtime.test.mjs`
  - 覆盖 sync `issue_tracker` path
  - 覆盖 async `ci_pipeline` callback resume、duplicate 与 out-of-order callback
- 更新 `apps/workflow-platform-api/tests/agent-governance.test.mjs`
  - 将旧的 `EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5` 断言升级为 B7 语义下的 `EVENT_SUBSCRIPTION_REQUIRED`

## Review-driven hardening
- 根据本轮代码审查，补了 3 处实现加固：
  - `dispatchEventSubscription` 现在在 platform 侧把 `dispatchKey` 命名空间化为 `eventSubscriptionId:dispatchKey`，避免多个 subscription 共用上游 event id 时互相撞全局 dedupe。
  - connector secret 使用前新增统一校验：action run 启动与 event-subscription runtime-config 都要求 `agent_definition / connector_binding / action_binding / trigger_binding / event_subscription` 目标上的 active scope grant 之一可使该 secret usable。
  - `workflow-runtime` 新增按 `publicCallbackKey` 解析 `ConnectorActionSession` 的 internal lookup；`connector-runtime` 在内存 miss 时会回查该接口，因此自身重启后仍能继续接收 async callback。
- 测试补强：
  - platform governance 测试新增 `CONNECTOR_SECRET_SCOPE_REQUIRED` 负例，以及两个 event subscriptions 共享同一外部 event id 时都能各自起 run 的回归断言。
  - workflow runtime 测试新增 `connector-runtime` 重启后 callback 恢复路径，确保不再依赖进程内 map。
