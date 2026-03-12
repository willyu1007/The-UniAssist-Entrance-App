# 02 Architecture

## Boundaries
- `workflow-platform-api` 是 connector control-plane objects 的唯一 northbound owner。
- `connector-runtime` 是 connector action 执行、callback ingress、event ingress 的唯一执行 owner。
- `workflow-runtime` 继续拥有 `WorkflowRun / WorkflowNodeRun / Artifact / ApprovalRequest` authoritative state，只新增 connector executor path。
- `trigger-scheduler` 保持原有 webhook/schedule 责任；`B7` 不把 connector event bridge 混入 `trigger-scheduler`。

## Key decisions
- workflow node type 不新增；connector action 节点继续使用 `executor`，并要求：
  - `executorId = "connector-runtime"`
  - `config.actionRef` 必填
  - 模板中禁止出现 binding id / secret ref / connector binding ref
- `ActionBinding` 为 agent-scoped object：
  - `agentId`
  - `actionRef`
  - `connectorBindingId`
  - `capabilityId`
  - `sideEffectClass`
  - `timeoutPolicy`
  - `browserFallbackConfig`
- `ConnectorDefinition` 持有 action catalog 与 event catalog；`ActionDefinition` 不单独一级化。
- `EventSubscription` 负责：
  - 绑定 `connectorBindingId`
  - 指向已有 `TriggerBinding(event_subscription)`
  - 定义 external event type / filter / normalization config
  - 暴露 public subscription key
- `CI` async callback 必须续跑同一个 `run/node`；event bridge 另行支持启动 agent run，但不是 CI happy path 主线。

## Interface summary
- Public northbound:
  - `/v1/connector-definitions`
  - `/v1/connector-bindings`
  - `/v1/agents/:agentId/action-bindings`
  - `/v1/event-subscriptions`
- Existing public route change:
  - `POST /v1/trigger-bindings/:triggerBindingId/enable` 支持 `event_subscription`
- Internal:
  - `connector-runtime` invoke route
  - `workflow-runtime` connector callback route
  - `workflow-platform-api` event-subscription runtime-config / dispatch route
- External ingress:
  - connector action callback webhook
  - event subscription webhook

## Data direction
- New authoritative control-plane objects:
  - `ConnectorDefinition`
  - `ConnectorBinding`
  - `ActionBinding`
  - `EventSubscription`
- New runtime-private ledgers:
  - `ConnectorActionSession`
  - `ConnectorEventReceipt`
- Existing B5 objects reused:
  - `PolicyBinding`
  - `SecretRef`
  - `ScopeGrant`
  - `TriggerBinding`
  - `GovernanceChangeRequest / Decision`

## Verification targets
- issue capability sync path
- CI capability async callback path
- event subscription dispatch path
- write-policy guardrails
- duplicate / replay rejection
