# 01 Plan

## Phases
1. Governance bootstrap
2. Contracts + schema expansion
3. Platform API bridge lifecycle and agent run entry
4. Runtime bridge callback implementation
5. Sample bridge and verification

## Detailed steps
- 建立 `B6` task bundle，更新 `T-011` 状态说明，并同步 project governance。
- 扩展 `packages/workflow-contracts`：
  - `BridgeRegistration`
  - bridge northbound request/response DTO
  - agent create/run/cancel 增补字段
  - runtime internal start/resume/cancel/callback DTO
- 扩展 `packages/executor-sdk`：
  - bridge manifest / health types
  - invoke / resume / cancel request-response
  - normalized callback envelope helpers
  - internal auth bridge client
- 扩展 `prisma/schema.prisma`：
  - `bridge_registrations`
  - `bridge_invoke_sessions`
  - `bridge_callback_receipts`
  - `agent_definitions.bridge_id`
- 为 `apps/workflow-platform-api` 增加：
  - bridge registration repository/service/controller routes
  - createAgent 时的 `bridgeId` 约束
  - `POST /v1/agents/:agentId/runs`
  - `POST /v1/runs/:runId/cancel`
- 为 `apps/workflow-runtime` 增加：
  - external runtime bridge command path
  - callback ingress 和 session ledger
  - external-runtime run cancel
  - compat executor 回归保护
- 新增 `apps/executor-bridge-sample`：
  - manifest / health
  - invoke / resume / cancel
  - callback push 到 runtime
- 跑 contracts / platform / runtime / sample bridge tests，并完成 governance sync。

## Risks & mitigations
- Risk: external-runtime run 与 compat-provider run 分支互相污染。
  - Mitigation: 通过 `run.metadata` 和 `agent.executorStrategy` 显式分流，非 external-runtime run 不进入 bridge path。
- Risk: platform API 与 runtime 对 bridge config 的 owner 不清晰。
  - Mitigation: platform API resolve and snapshot，runtime consume only；runtime 不查询 governance DB。
- Risk: callback 幂等和顺序处理不严导致重复推进状态机。
  - Mitigation: `callbackId + sequence` ledger、terminal guard、out-of-order reject tests。
