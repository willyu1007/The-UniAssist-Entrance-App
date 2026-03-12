# 02 Architecture

## Boundaries
- `workflow-platform-api` 是 bridge registration 与 agent-bridge binding 的唯一 northbound owner。
- `workflow-runtime` 继续拥有 `WorkflowRun / WorkflowNodeRun / Artifact / ApprovalRequest / DeliveryTarget` authoritative state。
- `executor-bridge-sample` 只是 vendor-neutral bridge adapter，不拥有任何平台正式对象主权。
- `worker` 继续只负责 formal event fan-out，不承接 bridge callback 中转。

## Key decisions
- agent 级桥接意味着 `AgentDefinition` 绑定 `bridgeId`；不意味着 bridge 替代 runtime state machine。
- `executorStrategy=external_runtime` 时必须同时满足：
  - agent 有 `bridgeId`
  - bridge 为 `active`
  - bridge.workspaceId 与 agent.workspaceId 一致
- runtime callback ingress 收敛为一个 normalized endpoint，`kind` 固定为：
  - `checkpoint`
  - `approval_requested`
  - `result`
  - `error`
- `cancel` northbound 固定为 `POST /v1/runs/:runId/cancel`；B6 首版仅 external-runtime run 可取消。

## Data model direction
- `BridgeRegistration`：bridge identity、baseUrl、status、manifestJson、healthJson、authConfigJson、callbackConfigJson、createdBy/updatedBy。
- `BridgeInvokeSession`：`bridgeSessionId/runId/nodeRunId/bridgeId/externalSessionRef/status/lastSequence/resumeToken/cancelledAt/metadataJson`。
- `BridgeCallbackReceipt`：`callbackId/bridgeSessionId/sequence/kind/status/receivedAt/errorMessage`，用于 dedupe 与顺序保护。
- `AgentDefinition.bridgeId` 是 bridge authoritative binding；不复用 `TriggerBinding.configJson` 或 workflow template metadata。

## Interface summary
- Northbound:
  - `GET/POST /v1/bridge-registrations`
  - `GET /v1/bridge-registrations/:bridgeId`
  - `POST /v1/bridge-registrations/:bridgeId/activate`
  - `POST /v1/bridge-registrations/:bridgeId/suspend`
  - `POST /v1/agents/:agentId/runs`
  - `POST /v1/runs/:runId/cancel`
- Internal runtime:
  - `POST /internal/runtime/start-run`
  - `POST /internal/runtime/resume-run`
  - `POST /internal/runtime/cancel-run`
  - `POST /internal/runtime/bridge-callback`
- Bridge protocol:
  - `POST /invoke`
  - `POST /resume`
  - `POST /cancel`
  - `GET /health`
  - `GET /manifest`

## Verification targets
- external-runtime agent create/start/cancel/query
- checkpoint -> approval_requested -> resume -> result 主链路
- duplicate callback 与 out-of-order callback 明确拒绝
- compat executor run 与 B3/B5 现有行为不回归
