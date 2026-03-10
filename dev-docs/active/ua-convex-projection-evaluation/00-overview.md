# 00 Overview

## Status
- State: in-progress
- Status note: `T-016` 的高影响评估边界已冻结，可作为后续是否创建 Convex 实验任务的判断基线；本子包仍不承接任何接入实现。
- Next step: 只有在需要实际验证 read-model 实时性收益时，才基于本评估包决定是否新开实验任务。

## Goal
建立一份 handoff-ready 的 Convex 评估基线，明确它是否值得作为 workflow 平台的后续投影层选择，以及它不能触碰的边界。

## Non-goals
- 不把 Convex 作为主数据库或主命令面
- 不实现同步逻辑
- 不更改控制台必须经由 `workflow-platform-api` 的查询边界
- 不重新讨论 Postgres/Prisma 的 authoritative store 地位

## Context
- `T-011` 已经锁定 Postgres/Prisma 为主账本，Convex 仅保留为后置可选投影层。
- `T-018` 已明确 authoritative vs projection 边界。
- `T-015` 已明确控制台是潜在 read-model 消费方。

## Acceptance criteria (high level)
- [x] 文档明确给出 Convex 可以承接和不能承接的职责
- [x] 文档明确给出候选 read models
- [x] 文档明确给出同步原则与失败边界
- [x] 文档明确给出 go/no-go 与退出条件
- [x] 文档能终止后续围绕“Convex 要不要做主库”的重复讨论
