# 03 Implementation Notes

## Status
- Current status: `completed`
- Last updated: 2026-03-11

## What changed
- 初始化 `B2 / ua-builder-draft-publish-implementation` task bundle，并同步 project governance。
- 在 `packages/workflow-contracts` 新增 draft / publish / recipe 所需 DTO、状态枚举和记录结构。
- 在 `prisma/schema.prisma` 新增 `WorkflowDraft`、`DraftRevision`、`WorkflowDraftSessionLink`、`RecipeDraft`，并同步 `docs/context/db/schema.json`。
- 将 `apps/workflow-platform-api` 从单文件 memory store 重构为 `controller + service + repository` 分层：
  - `platform-errors.ts`
  - `platform-controller.ts`
  - `platform-service.ts`
  - `platform-repository.ts`
- `workflow-platform-api` 新增 B2 draft API 与 recipe draft API，并将 `POST /v1/workflows` 改为固定返回 `410 WORKFLOW_DIRECT_CREATE_REMOVED`。
- publish path 已实现为 `draft -> WorkflowTemplateVersion` 晋升：
  - draft 仅在最新 validation 为 publishable 时允许 publish
  - 首次 publish 创建 `WorkflowTemplate`
  - 后续 publish 创建新 `WorkflowTemplateVersion`
  - 旧 published version 自动标记为 `superseded`
  - 当前 draft line 标记为 `published` 并冻结
- `apps/gateway` 新增 builder client / projection：
  - `gateway-builder-client.ts`
  - `gateway-builder-events.ts`
  - `/v0/ingest` 支持显式 builder 入口
  - `/v0/interact` 支持 `builder_focus|synthesize|validate|publish`
- `apps/frontend` 新增 builder chat intake 接线：
  - 顶部 quick entry
  - active draft pill
  - card action payload 透传
  - session reset 时清理 builder draft 本地状态
- 将 `workflow-platform-api` 的 Prisma 依赖版本对齐到 `6.16.0`，并在 root 补充 `prisma` CLI，避免 Prisma 7 与现有 `schema.prisma` datasource 写法不兼容。
- `gateway-builder-events` 现在会对 terminal draft 隐藏 `synthesize / validate / publish` 动作，避免前端出现必然失败的按钮。
- Postgres repository 现已将 draft mutate / publish 放入显式 transaction，并在 publish 时通过 `workflowKey` advisory lock 串行化同一工作流的版本晋升。
- `workflow_draft_session_links` 的 active 切换现已通过 session-scoped advisory lock 串行化，避免并发 focus/create 导致同一 session 出现多个 active draft。
- 测试迁移到 B2 路径：
  - `apps/workflow-platform-api/tests/workflow-platform-api.test.mjs`
  - `apps/gateway/tests/workflow-entry.mjs`
  - 新增 provenance 保留与 terminal draft action 抑制断言

## Decisions & tradeoffs
- platform API 将采用 repository + service 分层，并保留 memory fallback 以支持无 DB 环境下的本地测试。
- Prisma schema 继续作为 DB SSOT；除非用户单独批准，不执行任何 target DB 写入。
- B2 不改 `workflow-runtime` 持久化，也不触碰 runtime 状态机边界。
- builder northbound 投影继续复用现有 `assistant_message` / `card`，不扩 `v0` 合同。
- chat builder routing 只接受显式入口：`raw.entryMode = workflow_builder` 或 `@builder ` 前缀。

## Known issues / follow-ups
- 当前未执行任何 Prisma migration / `db push` / target DB schema apply；若要把新表真正落到某个数据库，需要单独 approval。
- `RecipeDraft` 已作为控制面对象落库契约与 API，但 runtime evidence capture / lineage 仍留给 `B3`。
- 当前尚未生成并提交 `prisma/migrations/` 历史；本轮仅验证了 repo SSOT 对一次性本地 Postgres 目标的 `validate / db push / diff` 闭环。
