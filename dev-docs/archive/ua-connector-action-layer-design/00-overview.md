# 00 Overview

## Status
- State: in-progress
- Status note: `T-014` 高影响设计边界已冻结，可作为后续外部集成与 connector implementation 的引用基线；本子包仍不承接外部系统接入实现。
- Next step: 在此基线上继续细化 connector registry、binding schema 和 policy/invoke DTO。

## Goal
建立一份 handoff-ready 的 connector/action layer 设计基线，明确外部系统能力如何被治理、绑定和接入，而不破坏现有 workflow/runtime 主线。

## Non-goals
- 不实现任何 connector
- 不设计具体第三方 API 适配细节
- 不替代 executor/runtime 的职责
- 不引入 Convex 或其他投影层方案

## Context
- `T-011` 已明确 connector/action layer 是后置能力，不应打断 `P1/P2/P3` 主线。
- `T-012` 已冻结 platform API/runtime/worker 边界，因此 connector 不能再去拥有状态机或兼容投影。
- 历史上的首个 sample validation 场景可以在不依赖 connector 的情况下先验证平台原语，这正是本子包后置的理由。

## Acceptance criteria (high level)
- [x] 文档明确给出 connector/action/event bridge/browser fallback 的定义
- [x] 文档明确给出 auth/policy/secret binding 的归属
- [x] 文档明确给出与 platform API/runtime/worker 的交互面
- [x] 文档明确说明为什么 connector 不是 provider/executor 变体
- [x] 文档可以作为后续外部集成设计的统一前置
