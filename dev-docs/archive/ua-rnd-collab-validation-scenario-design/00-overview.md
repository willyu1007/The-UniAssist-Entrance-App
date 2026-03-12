# 00 Overview

## Status
- State: archived
- Status note: `T-022` 已完成并被 `T-030 / B8` 实施验证；第二验证场景已固定为“变更/发布协作”，其 artifact、callback/event 压测点和控制台最小可见性均已在实现包中落地。
- Next step: 无；如需扩展第二验证场景，仅在后续 capability/vendor tranche 中继续细化。

## Goal
建立一份 handoff-ready 的第二验证场景设计基线，用研发协作流程验证团队版 OpenClaw 在外部系统集成和治理上的主体能力。

## Non-goals
- 不实现具体 connector
- 不把某一工具品牌写死成平台默认栈
- 不直接把 Work Graph 升格为一级对象

## Context
- v0.2 设计记录明确是“两个验证场景回灌”，而当前任务图只有教学场景。
- 如果没有第二验证场景，当前规划只能证明横向 substrate，不能完整覆盖协作型 OpenClaw 的外部集成主诉求。

## Acceptance criteria (high level)
- [x] 文档明确给出第二验证场景的流程和核心对象
- [x] 文档明确给出 connector/action/event bridge 的压测点
- [x] 文档明确给出 runtime/preset vs 平台硬缺口的回灌判断
- [x] 文档可以作为后续 connector/runtime implementation 的验证前置
