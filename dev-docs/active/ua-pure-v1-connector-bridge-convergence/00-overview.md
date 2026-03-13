# 00 Overview

## Status
- State: planned
- Status note: `T-036` 已建立为 pure-`v1` 外部能力收敛任务；当前仅完成任务包建档。
- Next step: 在 `T-034` 稳定 run ledger 后，接手 connector runtime 和 external runtime bridge 的主线对齐。

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
- [ ] connector runtime 不再依赖 hardcoded sample adapter map，而由 control-plane enabled set 或部署清单驱动
- [ ] connector actions、event subscriptions、bridge callbacks 全部对齐到 pure-`v1` run ledger
- [ ] connector 与 bridge 的 approval/artifact/governance 语义不再各自为政
- [ ] `platform_runtime` 与 `external_runtime` 的边界保持清晰，不因接入外部能力而重新混合
- [ ] 外部能力扩展不引入新的 compat alias 或 provider-style terminology
