# 00 Overview

## Status
- State: done
- Status note: `B5` 后端/contracts/runtime 已落地；针对 review follow-up 已补齐治理请求前置校验、trigger workspace 约束、schedule suspend/retire pause-resume 语义以及 invalid webhook JSON 的 400 映射，并完成 targeted typecheck + tests。
- Next step: 若用户确认本 tranche 无进一步 follow-up，则按归档流程移动到 `dev-docs/archive/`。

## Goal
实现 `T-011 / B5` 的完整 agent governance 闭环：交付 `AgentDefinition`、`TriggerBinding`、`PolicyBinding`、`SecretRef`、`ScopeGrant`、`GovernanceChangeRequest/Decision` 及其 northbound API，并落地 `schedule + direct webhook` 的 trigger runtime。

## Non-goals
- 不实现 control-console 新页面
- 不引入 vault/KMS 或真实 secret provider
- 不实现 external runtime callback bridge
- 不实现 connector event bridge 或 `event_subscription` 真正 dispatch

## Context
- `T-019` 已冻结 `AgentDefinition`、trigger owner 与 activate/suspend/retire 的边界。
- `T-021` 已冻结 policy/secret/scope 的治理对象清单，但本包将把 runtime approval 与 control-plane governance approval 做语义分层。
- `B3/B4` 已交付 runtime approval queue/detail/decision；本包不能破坏现有 `/v1/approvals` 语义。
- `T-011` 已明确 `apps/trigger-scheduler` 可在 `B5` 作为独立 deployable 落地。

## Acceptance criteria (high level)
- [x] 建立独立 `B5` task bundle 并同步 project governance
- [x] `packages/workflow-contracts` 补齐 B5 authoritative records、DTO 与 trigger runtime ingress contract
- [x] `prisma/schema.prisma` 落 B5 control-plane objects，且不把 runtime approval 泛化成 governance ledger
- [x] `apps/workflow-platform-api` 提供 agent/governance northbound API 与 apply path
- [x] 新增 `apps/trigger-scheduler` 并跑通 `schedule + direct webhook` trigger runtime
- [x] `packages/policy-sdk` 提供 B5 所需最小 policy helpers
- [x] 完成 contracts/platform/scheduler typecheck 与 API/runtime tests，并回写 verification
