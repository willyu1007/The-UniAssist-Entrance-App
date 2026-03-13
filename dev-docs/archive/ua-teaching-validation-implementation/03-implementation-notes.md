# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-03-11

## Current state
- `provider-plan -> provider-sample` 的硬切换已完成，入口脚本、service id、env key、ops 文件与测试基线已切到 `sample` / `provider-sample` / `compat-sample`。
- `apps/provider-sample` 已改为 canonical sample executor，同时兼容历史 `parse_materials -> generate_assessment -> fanout_delivery` 命名与中性的 sample-review node aliases。
- `apps/workflow-runtime` 已接入 dual-layer state：运行态继续以内存推进，查询与冷启动回填可通过 Postgres repository 读取 `workflow_runs`、`workflow_node_runs`、`artifacts`、`approval_*`、`actor_*`、`audience_*`、`delivery_*`。
- `packages/workflow-contracts` 已扩充 typed artifact payload、run query / artifact detail response、compat workflow envelope 与 canonical sample review helper。
- `apps/workflow-platform-api` 已在 `startRun` / `resumeRun` / `getRun` 后执行 run-derived recipe capture，幂等创建或更新 `RecipeDraft`，`source` 固定为 `run_derived_recipe`。
- `docs/scenarios/sample-review` 已补 canonical input / expected artifact fixtures。

## Initial decisions
- 本包在实现阶段一次性完成 `provider-sample -> provider-sample` 的硬切换，不保留旧兼容别名。
- 历史任务名中的 teaching validation 只表示当时的样例命名，不引入独立 teaching app。
- public endpoint 集合保持不变，只扩展现有 run / artifact 响应 shape。
- runtime 不直接北向创建 `RecipeDraft`，仍由 `workflow-platform-api` 控制面捕获。

## Follow-up TODOs
- 若需要真实 DB 验证 cold-reload persistence，补一轮带 Postgres 的集成验证
- 评估是否需要把 canonical sample review helper 接入私有 seed script

## 2026-03-12 Review fixes
- 修复 `provider-sample` 与 `workflow-platform-api` 之间的 recipe/evidence 语义错位：sample provider 不再把 `observationRefs` 误写到 `AnalysisRecipeCandidate.evidenceRefs`，runtime 会基于同批次创建出的 `EvidencePack` artifactIds 回填 `evidenceRefs` 与 lineage。
- 修复 runtime Postgres 定向持久化的 run scope 丢失问题：`actor_profiles` 改为 `(run_id, actor_id)` 复合主键，`actor_memberships` 新增 `run_id`，reload 查询改为按 `run_id` 精确回填，不再通过 actorId 反查跨 run 数据。
- 修复 `workflow_runs` 冷恢复只还原近似 metadata 的问题：`workflow_runs` 新增 `metadata_json`，runtime repository 在 save/load 路径显式读写，`inputText` / `inputPayload` 不再依赖首个 node input 反推。
- 修复 run-derived `RecipeDraft` 的并发幂等缺口：`recipe_drafts` 新增 `source_artifact_id` 唯一锚点，platform repository 新增 `upsertRunDerivedRecipeDraft()`，冲突时保留既有 `recipeDraftId` / `createdAt` / 业务 status，仅刷新结构化内容。

## 2026-03-12 Cleanup
- 按用户要求移除了本轮新增的 repository 级测试文件与 `pg-mem` 测试依赖，保留业务修复代码与现有工作区基线测试入口。
