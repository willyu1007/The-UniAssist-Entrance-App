# 00 Overview

## Status
- State: done
- Status note: `B4` implementation 已完成并完成核心验证；独立 `apps/control-console`、control-console northbound/internal API、SSE invalidation、section patch、approval decision 已落地。
- Next step: 进行人工 review / walkthrough，确认控制台交互细节与后续 tranche（如 gateway hosting / auth）切分边界。

## Goal
实现 `T-011 / B4` 的 control console foundation：交付独立 `apps/control-console` Web 应用，以及 `Runboard`、`Approval Inbox`、`Draft Inspector`、`Workflow Studio` 所需的最小 API / contract / runtime 支撑。

## Non-goals
- 不引入用户登录、session auth 或 RBAC
- 不把控制台构建产物挂到 `apps/gateway`
- 不修改 `ui/tokens`、`ui/contract` 或引入 `packages/shared-ui`
- 不引入新的 projection store、Convex read model 或 canvas editor

## Context
- `T-011` 已冻结 `B4` 属于 `I3 / Validation Flow and Control Surface`，并要求 `control-console` 作为独立 Web 应用落地。
- `T-015` 已冻结技术栈与 IA：`React + Vite + TypeScript`、`TanStack Router`、`TanStack Query`、`Runboard / Approval Inbox / Draft Inspector / Workflow Studio`。
- `T-013` 已冻结 `WorkflowDraft / DraftRevision / RecipeDraft` 的 dual-entry 和 publish lineage；当前缺少 console-side structured edit mutation。
- 归档后的 `T-017` 与 `T-025` 已提供 historical sample validation run/artifact/approval/delivery 正式对象；当前缺少控制台友好的 run summary / approval queue / approval decision 查询面。
- repo 现状仍无 `apps/control-console` workspace，也无现成 Vite / Vitest / Web UI test 基建。

## Acceptance criteria (high level)
- [x] 建立独立 `B4` task bundle 并同步 project governance
- [x] `packages/workflow-contracts` 补齐控制台 northbound/internal DTO 与 SSE invalidation types
- [x] `workflow-runtime` 提供 run summary、approval queue/detail/decision 所需 internal API
- [x] `workflow-platform-api` 提供 `GET /v1/runs`、approval queue/detail/decision、draft spec patch、console stream
- [x] `apps/control-console` 交付四个 route group、SSE-first + polling fallback 数据层、Vitest smoke
- [x] 完成 typecheck / tests / UI governance gate，并回写 dev-docs 验证记录
