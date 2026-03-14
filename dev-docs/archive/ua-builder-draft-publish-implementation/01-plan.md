# 01 Plan

## Phases
1. Governance bootstrap
2. Contracts and Prisma schema
3. Platform repository / service / API
4. Gateway builder routing and projection
5. Frontend builder intake
6. Verification and context sync

## Detailed steps
- 建立 `B2` task bundle 并同步 project governance。
- 扩展 `packages/workflow-contracts`，冻结 draft / recipe / publish DTO。
- 更新 `prisma/schema.prisma`，新增 `WorkflowDraft`、`DraftRevision`、`WorkflowDraftSessionLink`、`RecipeDraft`。
- 为 `apps/workflow-platform-api` 引入 repository + service 分层：
  - memory fallback
  - Prisma repository
  - 统一 draft / recipe / workflow version orchestration
- 废弃 `POST /v1/workflows`，把创建路径切到 `draft -> publish`。
- gateway 新增 builder client 和显式 builder path，不复用 task-thread。
- frontend 增加 builder 快捷入口、active draft pill、draft switch cards。
- 回归平台 API、gateway compatibility、frontend smoke 所需测试。

## Risks & mitigations
- Risk: `B2` 变成 runtime persistence 重构。
- Mitigation: runtime 保持 B1 基线，只允许 platform API 切 repository。
- Risk: builder 误伤普通聊天入口。
- Mitigation: 仅接受 `raw.entryMode = "workflow_builder"` 或 `@builder ` 前缀。
- Risk: publish 语义和 activate/gated actions 混叠。
- Mitigation: B2 只实现 low-risk `publish`，其余动作一律缺席。
