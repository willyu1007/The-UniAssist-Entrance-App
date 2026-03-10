# 00 Overview

## Status
- State: in-progress
- Status note: `T-015` 高影响设计边界已冻结，可作为 control-console implementation 的引用基线；本子包仍不承接前端实现。
- Next step: 将 `T-015` 作为前置输入，进入控制台实现规划与 query DTO 细化。

## Goal
建立一份 handoff-ready 的控制台设计基线，明确 `control-console` 的技术栈、路由、首批页面、查询路径和 Studio 首期能力。

## Non-goals
- 不实现任何 Web 页面
- 不定义完整 design system 或大规模跨端组件复用
- 不做画布式编辑器
- 不设计全量 policy/registry 管理台

## Context
- `T-011` 已锁定 `control-console` 为独立 Web 应用，并把 `React + Vite` 作为全局约束。
- `T-012` 已锁定控制台只通过 `workflow-platform-api` 查询。
- `T-013` 提供 `WorkflowDraft` / `RecipeDraft`，`T-017` 提供首个验证场景，控制台需要围绕这些正式对象做运行治理视图。

## Acceptance criteria (high level)
- [x] 文档明确给出技术栈与数据层边界
- [x] 文档明确给出 `Runboard / Approval Inbox / Draft Inspector / Workflow Studio`
- [x] 文档明确给出 Workflow Studio 的首期能力与非目标
- [x] 文档明确给出 route groups 和 view model 依赖
- [x] 文档可以被后续控制台实现任务直接引用
