# 00 Overview

## Status
- State: done
- Next step: `B1` 已闭环；后续若进入平台主线实施，应为 `B2 / ua-builder-draft-publish-implementation` 开新 bundle。

## Goal
实现 `T-011 / B1` 的首个平台实施包，建立 workflow-centric 的最小可运行骨架，同时保持现有 `/v0` 兼容流量可回退。

## Non-goals
- 不实现 `WorkflowDraft/RecipeDraft`
- 不交付 `control-console`
- 不实现 connector/runtime bridge/governance/Convex 实验
- 不让 `/v0` 默认切到 workflow 路径

## Context
- `T-011` 已冻结 `B1` 的职责：`workflow-platform-api + workflow-runtime + workflow-contracts + executor-sdk + authoritative schema + compatibility handoff`。
- `T-012` 已冻结服务边界与 `/v0` handoff 归属。
- `T-018` 已冻结 authoritative vs projection 边界与 companion objects 范围。

## Acceptance criteria (high level)
- [x] 新 workspace 模块可启动并通过 typecheck
- [x] `POST /v1/workflows` 可创建 template + initial version
- [x] `POST /v1/runs` / `POST /v1/runs/:runId/resume` 可驱动有限图执行
- [x] gateway 在 feature flag 打开时可将 workflow hit 接到平台路径，并继续输出兼容 `/v0` 事件
- [x] 现有 `pnpm test:conformance` 在 feature flag 关闭时不回归
