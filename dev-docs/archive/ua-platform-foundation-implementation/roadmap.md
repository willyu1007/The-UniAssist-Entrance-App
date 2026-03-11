# Roadmap

## Summary
交付 `T-011 / B1` 的首个可运行平台骨架：新增 `workflow-platform-api`、`workflow-runtime`、`workflow-contracts`、`executor-sdk`，落 authoritative workflow/data-plane schema，并通过 feature-gated workflow entry policy 接入现有 `/v0` 兼容层。

## Milestones
1. 治理与任务束建立
2. contracts / executor-sdk / schema 基础落地
3. workflow-platform-api / workflow-runtime 可运行
4. gateway / worker compatibility handoff 接线
5. 测试、类型检查与 conformance 回归

## Deliverables
- 新 implementation task bundle 与治理注册
- `packages/workflow-contracts`
- `packages/executor-sdk`
- `apps/workflow-platform-api`
- `apps/workflow-runtime`
- Prisma schema + DB context 更新
- `/v0` workflow entry feature flag 接线
