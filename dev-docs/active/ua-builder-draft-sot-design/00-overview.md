# 00 Overview

## Status
- State: in-progress
- Status note: `T-013` 高影响设计边界已冻结，可作为 Builder、teaching 和 control-console 的引用基线；本子包仍不承接 UI 或 API 实施。
- Next step: 将 `T-013` 作为前置输入，进入 `T-017 / ua-teaching-assessment-scenario-design` 的进一步对齐。

## Goal
建立一份 handoff-ready 的 Builder 设计基线，明确聊天面和控制台如何共享同一个 draft SoT，以及 workflow/recipe draft 的生命周期、发布治理和晋升路径。

## Non-goals
- 不实现任何 Builder UI
- 不设计控制台路由或页面布局
- 不定义 runtime 执行语义
- 不定义 connector/action 或长期 agent activation 细节

## Context
- `T-011` 已锁定：Builder 采用双入口，`Control Plane Draft` 是单一事实源，高风险能力另审。
- `T-012` 已锁定：所有命令与查询都通过 `workflow-platform-api`。
- `T-018` 已锁定：正式数据面与 projection 边界，draft 不应落回聊天消息或 UI 本地状态。

## Acceptance criteria (high level)
- [x] 文档明确给出 `WorkflowDraft` / `RecipeDraft` 的事实源和生命周期
- [x] 文档明确给出 chat surface 与 control console 的双入口模型
- [x] 文档明确给出 publish / activate / bind / schedule / external write 的风险分层
- [x] 文档明确给出 recipe draft 的生成、审核、晋升路径
- [x] 文档可以被 teaching 和 control-console 子包直接引用
