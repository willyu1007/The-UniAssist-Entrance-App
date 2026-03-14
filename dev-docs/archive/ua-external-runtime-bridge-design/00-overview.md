# 00 Overview

## Status
- State: in-progress
- Status note: `T-020` 已完成首轮高影响边界收敛；external runtime bridge 已明确归属 executor/capability 体系，首版 command/callback contract 也已冻结。
- Next step: 继续细化 bridge registration、normalized envelope 载荷和 callback DTO 边界。

## Goal
建立一份 handoff-ready 的 external runtime bridge 设计基线，明确平台如何接入外部 agent/runtime 而不丢失控制面与正式数据主权。

## Non-goals
- 不实现具体 bridge
- 不绑定某个厂商 runtime
- 不取代平台自己的 workflow runtime

## Context
- 设计记录明确把外部 runtime 接入视为团队版 OpenClaw 的关键能力之一。
- 当前 `T-012` 和 `T-014` 只冻结了平台主线与 connector/action 边界，还没有单独承接 runtime bridge。

## Acceptance criteria (high level)
- [x] 文档明确给出 bridge 的定位与 owner
- [x] 文档明确给出 invoke/checkpoint/callback handoff
- [x] 文档明确给出 artifact/approval/delivery 的主权边界
- [ ] 文档可以作为后续 `executor-bridge-*` implementation 的统一前置
