# 00 Overview

## Status
- State: in-progress
- Status note: `B9` 代码实现、治理同步与本地自动化验证已完成；当前剩余工作仅是基于既有证据形成 go/no-go 结论，因此任务仍保持 `in-progress`。现有产物是默认关闭、可透明回退的 `Runboard` 单切片 Convex projection experiment。
- Next step: 基于已落地的实验和验证记录，收口 go/no-go 结论，并明确是否继续保留受控订阅桥及是否进入归档流程。

## Goal
实现 `T-011 / B9` 的 Convex projection experiment：在默认关闭、可透明回退的前提下，为 `Runboard` recent-first 列表引入真实 Convex-backed projection，并验证 `workflow-platform-api` 受控订阅桥的收益与维护成本。

## Non-goals
- 不让 `apps/control-console` 直连 Convex
- 不把 `WorkflowRun` / `Approval*` / `Artifact` authoritative state 迁到 Convex
- 不把 run detail、approval queue、draft feeds 一并迁入实验
- 不做 staging/prod rollout 或 cloud-side secret / deployment 变更

## Context
- `T-011` 已把 `B9` 定义为条件实验包，不阻塞 `B1-B8` 主线。
- `T-016` 已冻结：Convex 只能承接 projection/read-model；控制台仍需经由 `workflow-platform-api`。
- 当前 `apps/control-console` 已通过 `SSE invalidation + polling fallback` 消费 `/v1/runs`；本包只替换列表摘要来源与 `run.updated` 触发源，不改变公开 DTO。

## Acceptance criteria (high level)
- [x] 建立独立 `B9` task bundle 并同步 project governance
- [x] 新增独立 `packages/convex-projection-experiment` workspace，包含 Convex schema/functions 与 thin client wrapper
- [x] `apps/workflow-platform-api` 增加 `RunboardProjectionAdapter` seam、bootstrap、best-effort upsert、projection-backed `/v1/runs` 与 subscription bridge
- [x] 实验关闭、配置缺失、Convex 不可用时，`/v1/runs` 与 control-console SSE 均能透明回退
- [x] 自动化验证覆盖 bootstrap、upsert、subscription bridge、authoritative fallback 与非 run 事件不回归
