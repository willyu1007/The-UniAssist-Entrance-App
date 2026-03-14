# 02 Architecture

## Product center
- pure-`v1` 的系统中心是 workflow/agent execution platform，而不是 chat ingress、provider router 或 timeline projection。
- 生产运行入口固定为 `agent-first`。
- direct workflow/version run 仅保留为 studio/debug 的 operator capability，不作为正式业务入口。

## Frozen runtime model
- `platform_runtime`
  - 平台拥有 run/node 状态机、approval、artifact、connector action 调用和推进逻辑。
- `external_runtime`
  - 外部 runtime 拥有执行主循环；平台拥有治理、trigger、审批、callback 接线和结果入账。
- 第一版 pure-`v1` 固定为“一 agent 一 strategy”：
  - 一个 agent 只能选择 `platform_runtime` 或 `external_runtime`
  - 不在第一轮支持单 workflow 混合多种执行范式

## Authoritative object model
- `WorkflowTemplate`
- `WorkflowTemplateVersion`
- `WorkflowDraft`
- `DraftRevision`
- `AgentDefinition`
- `TriggerBinding`
- `ConnectorDefinition`
- `ConnectorBinding`
- `ActionBinding`
- `EventSubscription`
- `PolicyBinding`
- `ScopeGrant`
- `SecretRef`
- `BridgeRegistration`
- `WorkflowRun`
- `WorkflowNodeRun`
- `Artifact`
- `ApprovalRequest`
- `ApprovalDecision`
- `InteractionRequest`

## Removed compatibility concepts
- pure-`v1` 不再保留以下概念作为 active mainline semantics：
  - `/v0`
  - `compatProviderId`
  - `providerId` 作为 workflow identity
  - gateway ingress routing
  - builder chat intake
  - provider projections
  - workflow keyword entry
  - `replyToken`
  - `taskId` 作为 compat task projection
  - `WorkflowEntryRegistryEntry`

## Service boundaries
- `workflow-platform-api`
  - 控制面对象管理、agent-first run command、operator/studio query surface
- `workflow-runtime`
  - run/node state machine、approval/interaction blocking、formal event production
- `worker`
  - outbox、retry、background continuation、projection fan-out
- `control-console`
  - 纯 `v1` operator/studio surface
- `connector-runtime`
  - 按控制面启用集合或部署清单加载 connector，不允许再以 sample map 作为长期主线
- `external runtime bridge`
  - 外部执行主循环接线层，不反向污染主线 contract

## Legacy handling
- legacy `/v0` data 采用“只备份，不迁移语义”的策略。
- final cutover 完成后，旧表、旧模块和旧命名统一删除，不在主线中保留 alias。
