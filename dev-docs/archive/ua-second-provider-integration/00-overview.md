# 00 Overview

## Status
- State: blocked
- Next step: 等待 T-009（`ua-multi-provider-task-orchestration`）完成通用编排框架后再恢复。

## Goal
把当前“单真实专项可用”升级为“多真实专项可用”，验证统一入口的多路分发与聚合能力。

## Non-goals
- 不在本任务实现完整业务后端。
- 不扩展到超过 2 个真实专项。

## Context
- 现有 `plan` 专项已接入并可端到端运行。
- 多 provider 通用交互编排尚未完成，直接接入第二专项会导致重复改造。

## Dependency
- Blocked by: `T-009 ua-multi-provider-task-orchestration`

## Acceptance criteria (high level)
- [ ] 第二专项完成 invoke/interact 接入并通过 conformance。
- [ ] 多专项并发路由时，时间线聚合正确且可追踪来源。
- [ ] 结构化扩展事件在第二专项下可渲染与回传。
- [ ] 专项切换与 sticky 机制在双专项场景可用。
