# 01 Plan

## Phases
1. Governance bootstrap
2. Contracts + schema + policy helpers
3. Platform API persistence and northbound routes
4. Trigger scheduler runtime
5. Verification and governance sync

## Detailed steps
- 建立 `B5` task bundle，更新 `T-011` 状态说明，并同步 project governance。
- 扩展 `packages/workflow-contracts`：
  - agent / trigger / policy / secret / scope / governance records
  - northbound request/response DTO
  - scheduler internal ingress DTO
- 扩展 `prisma/schema.prisma`：
  - `AgentDefinition`
  - `TriggerBinding`
  - `PolicyBinding`
  - `SecretRef`
  - `ScopeGrant`
  - `GovernanceChangeRequest`
  - `GovernanceChangeDecision`
- 新增 `packages/policy-sdk`：
  - governance approval gating
  - approved change applicability
  - secret usability
  - trigger runnable checks
- 为 `apps/workflow-platform-api` 增加：
  - B5 repository/service/controller routes
  - governance request apply path
  - schedule first-fire computation
- 新增 `apps/trigger-scheduler`：
  - schedule scanning loop
  - internal schedule fire endpoint
  - public webhook ingress
  - idempotent run dispatch and trigger state updates
- 跑 contracts / platform / scheduler typecheck 与测试，并在不写真实 DB 的前提下完成 Prisma validate / diff preview。

## Risks & mitigations
- Risk: runtime approval 与 control-plane governance 重新混义。
  - Mitigation: 保持 `/v1/approvals` 原语义不变，新增 `GovernanceChangeRequest/Decision`。
- Risk: webhook trigger 越界成 connector/event bridge。
  - Mitigation: 仅支持 agent-owned direct inbound trigger，不承接 callback/event bridge。
- Risk: scheduler 与 platform API owner 混乱。
  - Mitigation: platform API 拥有 trigger config；scheduler 只做 dispatch/ingress/runtime state refresh。
- Risk: schema 变更破坏现有 tests。
  - Mitigation: 仅做 additive schema changes，不改 runtime approval record shape。
