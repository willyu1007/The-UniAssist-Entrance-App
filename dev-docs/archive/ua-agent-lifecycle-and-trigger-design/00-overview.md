# 00 Overview

## Status
- State: in-progress
- Status note: `T-019` 已完成首轮高影响边界收敛；`AgentDefinition` 与 `WorkflowTemplateVersion` 的关系、trigger 分流规则和激活状态机已冻结。
- Next step: 继续细化 `AgentDefinition` 的最小字段集合、trigger binding 外壳以及与治理模型的对接边界。

## Goal
建立一份 handoff-ready 的 agent lifecycle 设计基线，明确何时 workflow 会升格为 agent，以及长期触发能力如何被治理。

## Non-goals
- 不实现 scheduler/webhook 基础设施
- 不实现 agent runtime
- 不定义 secret/policy 细节

## Context
- 设计记录把 `workflow`、`agent`、`executor` 明确区分。
- 当前 `T-012` 为了稳定平台骨架，刻意把 `AgentDefinition` 排除在 `P1` 之外。
- 如果没有单独设计子包，后续会在 implementation 阶段重新争论“是不是每个 workflow 都要常驻化”。

## Acceptance criteria (high level)
- [x] 文档明确给出 `AgentDefinition` 的存在理由和生命周期
- [x] 文档明确给出 `publish` 与 `activate/suspend/retire` 的区别
- [x] 文档明确给出 trigger 的 owner、类型和 handoff
- [ ] 文档可以作为后续 agent/scheduler implementation 的统一前置
