# 01 Plan

## Phases
1. Bootstrap and governance sync
2. Contracts + schema + control-plane inventory
3. Platform API CRUD and governance extensions
4. Connector runtime, SDK, and sample connectors
5. Workflow runtime connector execution path
6. Verification and handoff update

## Detailed steps
- 建立 `B7` task bundle，并同步 `.ai/project/main/*`。
- 扩展 `packages/workflow-contracts`：
  - connector control-plane records / DTOs
  - connector runtime invoke / callback / event dispatch contract
  - runtime callback/event receipt contract
- 扩展 `prisma/schema.prisma`：
  - `ConnectorDefinition`
  - `ConnectorBinding`
  - `ActionBinding`
  - `EventSubscription`
  - `ConnectorActionSession`
  - `ConnectorEventReceipt`
- 为 `apps/workflow-platform-api` 增加：
  - connector CRUD
  - `event_subscription` trigger enable / dispatch
  - agent-scoped action binding resolution
  - draft/publish validation for connector executor nodes
- 新增 `packages/connector-sdk` 与 `apps/connector-runtime`：
  - adapter manifest / invoke / callback / event bridge interfaces
  - issue tracker sample connector
  - CI pipeline sample connector
- 为 `apps/workflow-runtime` 增加：
  - connector executor path
  - issue action synchronous completion
  - CI action pending session + callback resume
  - connector-specific callback dedupe / terminal guards
- 跑 typecheck / tests / Prisma validate / governance sync，并更新 `03/04/05`。

## Risks & mitigations
- Risk: connector binding 被模板版本直接引用，导致 workspace/secret 耦合。
  - Mitigation: 模板只保留 `actionRef`；platform API 在 run start 时解析 agent-scoped binding snapshot。
- Risk: `B7` 重新混入 `B6 bridge` 模型。
  - Mitigation: connector callback / session / receipt 使用独立 contract 与表，不复用 bridge registration/session。
- Risk: event bridge 变成第二套 trigger 系统。
  - Mitigation: 只让 `EventSubscription` 驱动已有 `TriggerBinding(event_subscription)`。
- Risk: browser fallback 越界成默认写路径。
  - Mitigation: 首版只允许 read/query fallback，write capability 必须 API-backed。
