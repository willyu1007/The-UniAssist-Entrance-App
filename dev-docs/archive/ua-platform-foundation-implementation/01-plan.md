# 01 Plan

## Phases
1. Governance bootstrap
2. Contracts and schema foundation
3. Platform API / runtime skeleton
4. Gateway / worker compatibility handoff
5. Verification and hardening

## Detailed steps
- 建立 task bundle 并同步项目治理索引。
- 新增 `packages/workflow-contracts` 与 `packages/executor-sdk`，冻结 B1 需要的 spec / formal event / executor contract。
- 更新 `prisma/schema.prisma`，新增 core + companion objects，并同步 DB context。
- 新增 `apps/workflow-platform-api` 与 `apps/workflow-runtime`，实现最小 `/v1` 面与内部 runtime command path。
- gateway 增加 workflow entry registry、feature flag 和 internal workflow projection route。
- worker 复用 outbox/retry 基础设施，增加 workflow formal event channel handling。
- 补平台 API / runtime 测试，回归 `pnpm typecheck:workspaces`、`pnpm test:conformance`、相关 smoke。

## Risks & mitigations
- Risk: `B1` 过度扩张成完整 workflow engine。
- Mitigation: 限定 node set 为 `executor/approval_gate/end`，只支持简单条件跳转。
- Risk: workflow 接线影响现有 `/v0` 行为。
- Mitigation: feature flag 默认关闭，路由优先级固定为 `pending task > workflow registry > provider routing > fallback`。
- Risk: 新平台对象和 `/v0` projection 归属混淆。
- Mitigation: authoritative objects 只进 platform/runtime；兼容 `task_question/task_state/timeline` 只由 gateway 生成。
