# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No `apps/control-console` code, route files, or UI implementation has been started in this task.

## Initial decisions
- 本子包直接依赖 `T-012` 的 query ownership、`T-013` 的 draft model、`T-017` 的场景对象。
- 技术栈冻结为 `React + Vite + TypeScript`，建议采用 `TanStack Router + TanStack Query`。
- 首批页面固定为 `Runboard`, `Approval Inbox`, `Draft Inspector`, `Workflow Studio`。
- `Workflow Studio` 采用 spec-first + conversational intake + mixed editing + 轻量 revision compare + read-only DAG preview。
- `Artifact Explorer` 暂不提升为独立主区，只嵌入 Runboard / Approval / Draft 上下文。
- control console 不直连 runtime/DB/Convex，只走 `workflow-platform-api`。

## Deferred decisions
- 具体 UI contract 组件目录布局
- 实时刷新策略采用 polling 还是 SSE-first
- `revision compare` 是嵌入式面板还是独立次级视图

## Follow-up TODOs
- 用本子包结果支撑 control-console implementation task
- 与 query DTO 设计保持对齐
- 在 UI contract 层定义控制台 view model 的展示约束
