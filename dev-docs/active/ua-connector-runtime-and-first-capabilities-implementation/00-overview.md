# 00 Overview

## Status
- State: done
- Status note: `B7` 已在初版实现后完成 review-driven hardening；修复了 event-subscription 全局 dedupe 冲突、connector secret scope grant 漏校验，以及 connector-runtime 重启后 async callback 路由丢失的问题，并重新通过定向回归。
- Next step: 如需进入收尾流程，可执行 archive / handoff；若继续扩展，则从真实厂商 adapter、console UI 或 polling worker 开始。

## Goal
实现 `T-011 / B7` 的 connector runtime 与首批 capability：独立 connector 执行面、压缩对象集控制面、`issue_tracker + ci_pipeline` 两类 generic sample capability、`webhook-first` event bridge，以及 `CI` 同一 run 异步续跑。

## Non-goals
- 不实现 `source_control` 第三类 capability
- 不绑定真实外部厂商
- 不新增控制台页面
- 不交付 polling runnable path
- 不让 browser fallback 执行 write capability

## Context
- `T-014` 已冻结 connector/action/event bridge/browser fallback 的边界，但当前 repo 仍没有 `connector-runtime / connector-sdk / apps/connectors/*`。
- `B5` 已落地 governance、`TriggerBinding` 与 `event_subscription` 占位模型，但 `event_subscription` 仍不可启用。
- `B6` 已落地 bridge callback 账本与异步续跑模式，为 `B7` 的 callback/receipt 设计提供了参考，但两者不能混用同一对象模型。
- 当前 workflow template/version 不带 `workspaceId`，因此 connector 节点不能在模板里直接引用环境相关 binding id。

## Acceptance criteria (high level)
- [x] 建立独立 `B7` task bundle 并纳入 project governance
- [x] `packages/workflow-contracts` 与 Prisma 补齐 `ConnectorDefinition / ConnectorBinding / ActionBinding / EventSubscription` 及 callback/event ledger
- [x] `apps/workflow-platform-api` 提供 connector control-plane CRUD、event-subscription dispatch 与 connector-aware validation
- [x] 新增 `apps/connector-runtime`、`packages/connector-sdk` 与两类 sample connectors
- [x] `apps/workflow-runtime` 跑通 connector executor 的同步 issue path 与异步 CI callback path
- [x] contracts / platform / runtime / connector runtime / sample connector 测试通过，并回写 verification
