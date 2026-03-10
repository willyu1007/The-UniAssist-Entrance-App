# 00 Overview

## Status
- State: in-progress
- Status note: `T-022` 已完成首轮高影响边界收敛；第二验证场景已固定为“变更/发布协作”，首版能力组合也已压缩为 3 个主能力类别。
- Next step: 继续细化核心 artifact 字段、异步 callback summary 和与控制台视图的映射。

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
- [ ] 文档可以作为后续 connector/runtime implementation 的验证前置
