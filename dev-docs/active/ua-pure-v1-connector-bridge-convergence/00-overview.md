# 00 Overview

## Status
- State: done
- Status note: `T-036` 已完成 pure-`v1` 外部能力收敛主线实现：connector deployment registry、connector/event receipt ledger、event-subscription runtime handoff、以及 connector/bridge external-result 语义已接入纯 `v1` 内核。
- Next step: 进入 `T-037` 的不可逆切换与语义清扫，移除 remaining compat-only naming/path。

## Goal
将 connector runtime 和 external runtime bridge 纳入同一套 pure-`v1` run/approval/artifact/governance ledger，而不让外部能力重新污染主线 contract。

## Non-goals
- 不重定义主线 run ledger
- 不重做 control-console 主信息架构
- 不执行 legacy 删除
- 不把 connector 或 bridge 变回 provider/executor 兼容变体

## Context
- `T-014` 已冻结 connector/action layer 的治理边界。
- `T-020` 已冻结 external runtime bridge 的主权边界。
- `T-034` 需要先证明平台内核独立可运行，`T-036` 才能安全接入外部能力。

## Acceptance criteria (high level)
- [x] connector runtime 不再依赖 hardcoded sample adapter map，而由部署清单驱动并在 platform 侧与 active control-plane 对象取交集
- [x] connector actions、event subscriptions、bridge callbacks 全部对齐到 pure-`v1` run ledger
- [x] connector 与 bridge 的 approval/artifact/governance 语义不再各自为政
- [x] `platform_runtime` 与 `external_runtime` 的边界保持清晰，不因接入外部能力而重新混合
- [x] 外部能力扩展不再把 compat completion contract 暴露为 connector/bridge 主线语义
