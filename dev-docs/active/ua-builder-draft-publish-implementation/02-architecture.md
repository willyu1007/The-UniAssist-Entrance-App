# 02 Architecture

## Boundaries
- `workflow-platform-api` 负责 draft / revision / recipe / session-link / publish orchestration。
- `gateway` 只负责 builder intake、northbound projection 和 session continuity。
- `frontend` 只负责显式 builder 入口与 builder 状态呈现。
- `workflow-runtime` 不承接任何 B2 draft object。

## Key decisions
- `POST /v1/workflows` 直接废弃，不再作为正式创建入口。
- `WorkflowDraftSessionLink` 只做 session continuity，`active` 概念不升格为产品对象。
- 一个 session 同一时刻只有一个 active draft，但可以在本 session 已关联 drafts 间切换。
- `RecipeDraft` 是 control-plane object，不是 runtime projection。

## Landing map
- Primary API / service landing:
  - `apps/workflow-platform-api`
- Primary contract / schema landing:
  - `packages/workflow-contracts`
  - `prisma/schema.prisma`
- Chat compatibility landing:
  - `apps/gateway`
  - `apps/frontend`

## Publish contract
- publish 只允许从 latest validation 已达 `publishable` 的 draft line 发起。
- publish 会冻结当前 draft line，并创建新的或递增的 `WorkflowTemplateVersion`。
- 若 workflow 已存在，旧 published version 置为 `superseded`。
- publish 后 draft line 不可再编辑，只可查看与回溯。
