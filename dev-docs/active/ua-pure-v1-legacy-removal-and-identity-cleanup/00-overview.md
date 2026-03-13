# 00 Overview

## Status
- State: planned
- Status note: `T-037` 已建立为 pure-`v1` 不可逆切换与语义清扫任务；当前仅完成任务包建档。
- Next step: 在 `T-033` 到 `T-036` 主线稳定后，执行 legacy 备份、删除和全仓命名清扫。

## Goal
完成 pure-`v1` rewrite 的最终切换：备份 legacy `/v0` 相关数据，删除旧表与旧模块，清除 active mainline 中所有 compat 语义、命名和别名。

## Non-goals
- 不新增产品能力
- 不重开核心 contract 或 runtime 设计
- 不把 legacy 数据迁移为 pure-`v1` 语义对象
- 不保留兼容 alias 作为长期折中

## Context
- 用户已明确要求重构完成后不保留任何存在语义漂移的定义或命名。
- `T-032` 已冻结 legacy 策略：只备份，不迁移语义。
- 因此必须把删除和命名清扫独立成最后一个任务，而不是散落到前面几个任务里。

## Acceptance criteria (high level)
- [ ] legacy `/v0` 数据已完成一次可追溯备份
- [ ] legacy 表、模块、脚本、测试和文档已删除或重写
- [ ] active mainline 中不再存在 compat 语义、命名或 alias
- [ ] grep gate 能证明 `/v0`、compat/provider/gateway 旧语义已从 active code/docs/scripts/workspace metadata 移除
- [ ] 删除后的仓库仍能通过 governance 和主线验证
