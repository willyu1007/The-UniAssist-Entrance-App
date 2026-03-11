# 00 Overview

## Status
- State: completed
- Status note: `B2` 已按既定范围完成：builder draft SoT、publish path、chat intake 接线、recipe draft control-plane object、session active draft 约束与 Postgres smoke 均已落地并验证。
- Next step: 若要进入后续阶段，应单独立项处理 Prisma migration 历史提交，以及 `B3` 的 recipe capture / evidence lineage。

## Goal
实现 `T-011 / B2` 的 builder draft publish 控制面闭环：`WorkflowDraft`、`DraftRevision`、`RecipeDraft`、session-scoped active draft、draft -> publish -> template/version 晋升，以及 chat surface 的显式 builder 接线。

## Non-goals
- 不重做 `apps/workflow-runtime` 持久化或状态机
- 不实现 `apps/control-console`
- 不实现 `RecipeDraft` 的 runtime capture / evidence lineage 自动生成
- 不引入 `activate / bind / schedule / external write`

## Context
- `T-013` 已冻结 draft lifecycle、dual-entry 和 publish/risk layering。
- `T-012` 已冻结 `workflow-platform-api` 是唯一 command/query owner。
- `T-018` 已冻结 authoritative store 与 projection 边界。
- `T-023 / B1` 已交付 `/v1 + compat projection` 基线，但 `workflow-platform-api` 仍是 direct-create + memory store。

## Acceptance criteria (high level)
- [x] `WorkflowDraft` / `DraftRevision` / `RecipeDraft` 进入 authoritative schema 与 repository
- [x] `POST /v1/workflows` 固定返回 deprecation error
- [x] draft -> validate -> publish 可创建或晋升 `WorkflowTemplateVersion`
- [x] gateway 显式 builder 入口可 create/focus/intake/synthesize/validate/publish
- [x] frontend 具备 builder 快捷入口、active draft 展示与 draft 切换入口
