# Connector Runtime and First Capabilities Implementation — Roadmap

## Goal
- 交付 `T-011 / B7` 的首个 connector runtime 闭环：独立 connector 执行面、压缩 control-plane 对象集、`issue_tracker + ci_pipeline` 两类 generic capability、`webhook-first` event bridge，以及 `CI` 同一 run 异步续跑。

## Parent references
- `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
- `dev-docs/active/ua-connector-action-layer-design/02-architecture.md`
- `dev-docs/active/ua-agent-governance-implementation/02-architecture.md`
- `dev-docs/active/ua-external-runtime-bridge-implementation/02-architecture.md`
- `dev-docs/active/ua-rnd-collab-validation-scenario-design/02-architecture.md`

## Frozen implementation choices
- `apps/connector-runtime` 作为独立执行面；不并入 `workflow-runtime` 或 `workflow-platform-api`。
- `B7` 首批 capability 固定为 `issue_tracker + ci_pipeline`。
- event bridge 采用 `webhook-first`；polling 只保留 contract 和后续扩展位。
- `CI` callback 必须续跑同一个 run/node；不通过新 trigger 起第二条 run 作为主 happy path。
- workflow 节点形状不变；connector action 节点继续使用 `executor`，通过 `config.actionRef` 解析 agent-scoped binding。

## Non-goals
- 不实现 `source_control` capability
- 不接真实厂商 API
- 不新增 control-console 页面
- 不让 browser fallback 执行 write capability
- 不落 polling runnable loop

## Execution phases
1. Task bundle + governance bootstrap
2. Contracts / Prisma / control-plane objects
3. Platform API CRUD + governance + event-subscription dispatch
4. Connector runtime / SDK / sample connectors
5. Workflow runtime connector path + callback resume
6. Verification / governance sync / handoff update

## Acceptance gates
- Control plane:
  - `ConnectorDefinition / ConnectorBinding / ActionBinding / EventSubscription` northbound CRUD 可用
  - `TriggerBinding(event_subscription)` 可启用且受现有 governance 流程约束
- Runtime:
  - issue capability 同一 run 内同步完成
  - CI capability 同一 run/node 完成异步 callback 续跑
- Event bridge:
  - connector webhook -> normalized dispatch -> agent run 成功触发
- Guardrails:
  - browser fallback 执行 write capability 返回明确拒绝
  - duplicate / out-of-order callback 被拒绝
