# 02 Architecture

## Boundaries
- `workflow-platform-api` 是 B5 control-plane objects 与 governance requests 的唯一 northbound command/query owner。
- `workflow-runtime` 继续拥有 `WorkflowRun / WorkflowNodeRun / Artifact / ApprovalRequest / ApprovalDecision` 的 authoritative execution state。
- `trigger-scheduler` 只负责 `enabled schedule/webhook trigger` 的 runtime dispatch、ingress 校验、幂等与 trigger state refresh。
- `policy-sdk` 只提供纯函数 helper，不持有持久化主权。

## Key decisions
- `ApprovalRequest / ApprovalDecision` 只表示 runtime approval gate，不作为 control-plane governance ledger。
- `GovernanceChangeRequest / GovernanceChangeDecision` 是 control-plane privileged mutation 的正式审批对象。
- `manual/message` 不持久化为 `TriggerBinding`；只有 `schedule/webhook/event_subscription` 才属于长期 trigger config。
- `event_subscription` 本包只建模，不启用 dispatch。
- `schedule` 与 `webhook` 真正可运行；webhook ingress 由 `trigger-scheduler` 暴露，不由 `workflow-platform-api` 暴露。

## Data model direction
- `AgentDefinition` 引用已发布 `WorkflowTemplateVersion`，状态机固定为 `draft -> validated -> approved -> active -> suspended -> retired -> archived`。
- `TriggerBinding` 保存 `triggerKind/config/status/publicTriggerKey/lastTriggeredAt/nextTriggerAt/lastError`。
- `PolicyBinding` 负责 policy profile 到 target object 的绑定，不复用 approval 表。
- `SecretRef` 是 workspace-owned inventory object；可用性由 `ScopeGrant` 决定。
- `GovernanceChangeRequest` 承载 `requestKind/target/diff-like desiredState/riskLevel/summary`。

## Interfaces
- `POST /v1/agents/:agentId/activate`：
  - 如该动作需要审批，创建并返回 `GovernanceChangeRequest(pending)`。
  - 如不需要审批，直接 apply 并返回 `AgentDefinition(active)`。
- `POST /v1/trigger-bindings/:triggerBindingId/enable`：
  - `schedule/webhook` 允许经 governance 批准后进入 `enabled`
  - `event_subscription` 返回 `409 EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5`
- `POST /internal/triggers/schedule/:triggerBindingId/fire`：
  - scheduler internal-only trigger fire
- `POST /hooks/agent-triggers/:publicTriggerKey`：
  - public webhook ingress with signature/idempotency validation

## Verification targets
- API tests覆盖 agent create/activate、governance approval、trigger binding enable/disable、policy/secret/scope objects。
- Scheduler tests覆盖 schedule dispatch、disabled trigger guard、webhook signature / replay rejection。
- Regression tests覆盖现有 runtime approval queue/detail/decision。
