# 00 Overview

## Status
- State: in-progress
- Status note: `T-018` 的高影响数据面边界已冻结，可作为 builder、teaching、console、governance 和 bridge 设计的 authoritative baseline；本子包仍不承接 schema 实施。
- Next step: 在此基线上继续细化字段级 schema、索引和 query DTO，而不是重开对象边界。

## Goal
建立一份 handoff-ready 的数据面设计基线，明确 workflow core、artifact/approval、actor graph、audience selector、delivery spec 的 authoritative objects、生命周期和 `/v0` 兼容映射。

## Non-goals
- 不修改 `prisma/schema.prisma`
- 不创建任何 migration、repository 或 API DTO
- 不定义 Builder draft 生命周期
- 不定义教学场景 parser / prompt 内部实现

## Context
- `T-011` 已锁定全局方向：Postgres/Prisma 继续作为主账本，`Convex` 不进入首期主数据面，教学场景需要 `fan-out` 与个性化评估 agent 收敛。
- `T-012` 已冻结服务骨架和 `P1` 最小核心对象集：`workflow/run/node/artifact/approval`。
- 后续 `builder-draft`、`teaching-scenario`、`control-console` 都依赖统一的数据归属判断，如果不先冻结 authoritative/projection 边界，会在不同子包里重复发散。

## Acceptance criteria (high level)
- [x] 文档明确列出 authoritative objects 与 projection objects
- [x] 文档明确给出 `actor graph / audience selector / delivery spec` 的对象边界
- [x] 文档明确给出主要生命周期与关系规则
- [x] 文档明确给出 `/v0` 兼容映射和 timeline 降级定位
- [x] 文档可以被后续子包直接引用，而不再重复决定数据归属
