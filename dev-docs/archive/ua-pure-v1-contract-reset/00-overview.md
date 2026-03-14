# 00 Overview

## Status
- State: in-progress
- Status note: `T-033` 已完成 contract baseline 主体落地：main contract package、OpenAPI baseline、Prisma SSOT、DB context 与主要 consumer 编译面已经切到 pure-`v1`。
- Next step: 将 runtime 内部 compat executor/bridge adapter 的残余 provider/task 语义继续压缩，并在 `T-034` / `T-036` 中完成行为层纯化。

## Goal
重建 pure-`v1` 的 authoritative contract baseline，使后续所有实现任务都不再依赖 `/v0`、compat projection 或 provider-centric 语义。

## Non-goals
- 不实现 runtime、API handler、worker 或 UI 行为
- 不接入 connector runtime 或 external runtime bridge
- 不执行 legacy 模块删除
- 不在本任务中完成数据库迁移或 codegen 落地

## Context
- `T-032` 已冻结 pure-`v1` 方向：no `/v0`、agent-first、single agent single strategy、phased hard cutover。
- 当前主线合同仍混有 `compatProviderId`、`replyToken`、`taskId`、`WorkflowEntryRegistryEntry` 等 compat 语义。
- `T-019`、`T-021` 提供 agent/governance 设计输入，但它们不能替代主线 contract reset。

## Acceptance criteria (high level)
- [x] pure-`v1` authoritative objects、DTO、formal events、resume model 已冻结
- [x] `compatProviderId`、`WorkflowEntryRegistryEntry` 等概念已从主线合同、Prisma SSOT、OpenAPI 基线和主 UI/API surface 中剔除
- [x] `agent-first` run entry 与 `interaction/approval` split resume contract 已定义为唯一主线语义
- [x] `docs/context/api/openapi.yaml` 的 pure-`v1` contract scope 已定义
- [x] `prisma/schema.prisma` 与 `docs/context/db/schema.json` 已同步刷新
