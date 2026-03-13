# 00 Overview

## Status
- State: planned
- Status note: `T-033` 已建立为 pure-`v1` rewrite 的 contract baseline task；当前仅完成任务包建档，尚未进入实现。
- Next step: 从 `T-032` 接手 pure-`v1` object model、DTO、event model、OpenAPI 和 schema planning 的冻结工作。

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
- [ ] pure-`v1` authoritative objects、DTO、formal events、resume model 已冻结
- [ ] `compatProviderId`、`replyToken`、`taskId`、`WorkflowEntryRegistryEntry` 等概念已从主线合同和 API 基线中剔除
- [ ] `agent-first` run entry 与 `interaction/approval` resume contract 已定义为唯一主线语义
- [ ] `docs/context/api/openapi.yaml` 的 pure-`v1` contract scope 已定义
- [ ] `prisma/schema.prisma` 和 `docs/context/db/schema.json` 的调整边界已形成 handoff-ready 计划
