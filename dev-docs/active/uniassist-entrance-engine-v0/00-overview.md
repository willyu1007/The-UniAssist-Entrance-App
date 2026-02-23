# 00 Overview

## Status
- State: in-progress
- Status note: v0 主链路与投递闭环已完成，进入 v1 hardening。
- Next step: 进入 v1 级别优化（生产部署、监控告警、内部签名/JWT、对象存储与回放管线强化）。

## Goal
将当前仓库升级为 UniAssist 统一入口引擎 v0：支持统一输入、路由分发、兜底聊天、结构化交互扩展、长周期事件投递与微信文本接入闭环。

## Non-goals
- 在本仓库实现任一专项业务的完整领域逻辑与数据模型
- v0 建设完整内部链路签名+JWT（仅做外部入口签名最低安全）
- v0 实现医疗策略中心

## Context
- 当前：`contracts + gateway + adapter-wechat + provider-plan + worker + frontend` 均已落地。
- 已有：统一输入/路由分发/兜底/结构化扩展交互/外部接入/投递链路的 v0 可运行实现。
- 目标：在现有 v0 基础上推进生产级治理与规模化能力。

## Acceptance criteria (high level)
- [x] `packages/contracts` 提供 v0 类型与 JSON schema（含 `profileRef` 与 `provider_extension`）
- [x] `apps/gateway` 提供 `/v0/ingest`、`/v0/interact`、`/v0/stream`、`/v0/events`、`/v0/context/users/{profileRef}`
- [x] 未命中可直接兜底聊天，且事件流可见 `routing_decision` + fallback `interaction`
- [x] 前端可渲染结构化扩展事件（data collection request/progress/result）
- [x] 前端时间线展示来源标签与“建议切换专项”芯片
- [x] 会话支持自动切分规则（闲置 + 主题漂移）与手动新建入口
- [x] 微信适配层最小入站+文本回传链路可用（v0 骨架）
- [x] 至少 1 个真实专项 provider 完成 invoke/interact 端到端接入（`apps/provider-plan`）
- [x] `apps/worker` 完成 outbox retry + Redis consumer 并通过端到端冒烟
